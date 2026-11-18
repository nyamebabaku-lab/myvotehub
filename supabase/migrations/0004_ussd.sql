-- MyVoteHub USSD voting, nominee dashboards and SMS receipts.
-- The whole USSD menu runs in the database (ussd_step), so every provider adapter
-- (Edge Function `ussd`) and the Admin app's simulator share one tested engine.

alter table settings add column ussd_code text;               -- e.g. '*713*44#', shown on event pages once set
alter table settings add column sms_mode text not null default 'simulated' check (sms_mode in ('simulated', 'live'));

-- ---------------------------------------------------------------- SMS receipts (simulated until a provider is connected)
create table sms_log (
  id bigint generated always as identity primary key,
  phone text not null,
  message text not null,
  status text not null default 'simulated' check (status in ('simulated', 'queued', 'sent', 'failed')),
  event_id uuid references events on delete set null,
  created_at timestamptz not null default now()
);
alter table sms_log enable row level security;
create policy "admins read sms" on sms_log for select using (is_admin());

-- ---------------------------------------------------------------- USSD sessions
create table ussd_sessions (
  id text primary key,                 -- provider session id
  phone text not null,
  state jsonb not null default '{"screen":"home"}',
  updated_at timestamptz not null default now()
);
alter table ussd_sessions enable row level security; -- no policies: engine only

-- ---------------------------------------------------------------- private nominee dashboard links
create table nominee_links (
  nominee_id uuid primary key references nominees on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', '')
);
alter table nominee_links enable row level security;
create policy "organisers read links" on nominee_links for select
  using (can_manage_event((select event_id from nominees where id = nominee_id)));

-- Link for a nominee (created on first use). Organisers of the event and admins only.
create or replace function nominee_link(nid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not can_manage_event((select event_id from nominees where id = nid)) then raise exception 'Not your nominee'; end if;
  insert into nominee_links (nominee_id) values (nid) on conflict (nominee_id) do nothing;
  select token into t from nominee_links where nominee_id = nid;
  return t;
end $$;

create or replace function reset_nominee_link(nid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  if not can_manage_event((select event_id from nominees where id = nid)) then raise exception 'Not your nominee'; end if;
  insert into nominee_links (nominee_id, token) values (nid, t) on conflict (nominee_id) do update set token = excluded.token;
  perform audit('Nominee link reset', (select name from nominees where id = nid), null, (select event_id from nominees where id = nid));
  return t;
end $$;

-- Votes that count for a nominee now (current round rules, test money only in test mode).
create or replace function counted_votes(e events) returns setof votes language sql stable security definer set search_path = public as $$
  select v.* from votes v
  where v.event_id = e.id and not v.void and (not v.is_test or test_mode())
    and (e.rounds is null
         or (coalesce((e.rounds->>'carryOver')::boolean, false) and coalesce(v.round, 1) <= (e.rounds->>'current')::int)
         or coalesce(v.round, 1) = (e.rounds->>'current')::int);
$$;

-- What a nominee sees through their private link: one combined total (web and USSD are never split here).
create or replace function nominee_dashboard(t text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n nominees; e events; c categories; tally jsonb; mine bigint; rk int; total_n int; today bigint; series jsonb; tz text := 'Africa/Accra';
begin
  select nm.* into n from nominee_links l join nominees nm on nm.id = l.nominee_id where l.token = t;
  if n.id is null then return null; end if;
  select * into e from events where id = n.event_id;
  select * into c from categories where id = n.category_id;
  select coalesce(sum(qty), 0) into mine from counted_votes(e) where nominee_id = n.id;
  select coalesce(sum(qty), 0) into today from counted_votes(e)
    where nominee_id = n.id and created_at >= date_trunc('day', now() at time zone tz) at time zone tz;
  -- Rank among nominees still in the category, only when the event shows rankings.
  if e.show_leaderboard or e.results_released then
    with t2 as (
      select x.id, coalesce((select sum(qty) from counted_votes(e) v where v.nominee_id = x.id), 0) s
      from nominees x where x.category_id = n.category_id and x.status <> 'evicted'
    )
    select count(*) filter (where s > mine) + 1, count(*) into rk, total_n from t2;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d, 'DD Mon'), 'votes', coalesce(s, 0)) order by d), '[]') into series
  from generate_series((now() at time zone tz)::date - 13, (now() at time zone tz)::date, '1 day') d
  left join lateral (
    select sum(qty) s from votes v
    where v.nominee_id = n.id and not v.void and (not v.is_test or test_mode())
      and (v.created_at at time zone tz)::date = d
  ) z on true;
  return jsonb_build_object(
    'nominee', jsonb_build_object('id', n.id, 'name', n.name, 'code', n.code, 'photo', n.photo_url, 'status', n.status, 'evictedRound', n.evicted_round, 'bio', n.bio),
    'category', c.name,
    'event', jsonb_build_object('id', e.id, 'title', e.title, 'type', e.type, 'cover', e.cover, 'image', e.image_url, 'status', e.status, 'startAt', e.start_at, 'endAt', e.end_at,
      'votingMode', e.voting_mode, 'roundLabel', (select r->>'label' from jsonb_array_elements(coalesce(e.rounds->'list', '[]')) r where (r->>'n')::int = (e.rounds->>'current')::int)),
    'company', (select name from companies where id = e.company_id),
    'total', mine, 'today', today, 'rank', rk, 'competitors', total_n,
    'testMode', test_mode(), 'ussdCode', (select ussd_code from settings),
    'daily', series, 'at', now());
end $$;

-- ---------------------------------------------------------------- USSD helpers
create or replace function ussd_phone(p text) returns text language sql immutable as $$
  select case when d like '233%' and length(d) = 12 then '0' || substr(d, 4) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x;
$$;
create or replace function ussd_cedi(n numeric) returns text language sql immutable as $$
  select 'GHS ' || to_char(n, 'FM999,990.00');
$$;
create or replace function ussd_cut(s text, n int default 24) returns text language sql immutable as $$
  select case when length(s) > n then left(s, n - 1) || '…' else s end;
$$;
create or replace function ussd_live_events() returns setof events language sql stable security definer set search_path = public as $$
  select e.* from events e join companies c on c.id = e.company_id
  where e.status = 'live' and now() >= e.start_at and now() < e.end_at and c.status = 'active'
  order by e.end_at;
$$;
-- A numbered page of choices: "1. A\n2. B …", with "9. More" when there are more.
create or replace function ussd_page(labels text[], page int, size int default 5) returns text language plpgsql immutable as $$
declare s text := ''; i int;
begin
  for i in 1..least(size, coalesce(array_length(labels, 1), 0) - page * size) loop
    s := s || i || '. ' || labels[page * size + i] || E'\n';
  end loop;
  if coalesce(array_length(labels, 1), 0) > (page + 1) * size then s := s || E'9. More\n'; end if;
  return s || '0. Back';
end $$;

create or replace function ussd_votes_for(n nominees, e events) returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty), 0) from counted_votes(e) where nominee_id = n.id;
$$;

-- Records a USSD vote (the caller's network number is the voter). Returns the screen to show.
create or replace function ussd_cast(phone text, nid uuid, qty int) returns text
language plpgsql security definer set search_path = public as $$
declare n nominees; e events; r record; used int; since timestamptz; msg text; fl text;
begin
  select * into n from nominees where id = nid;
  select * into e from events where id = n.event_id;
  perform check_votable(e, n);
  if e.voting_mode = 'free' then
    since := case when e.free_period = 'daily' then date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra' else '-infinity'::timestamptz end;
    select coalesce(sum(v.qty), 0) into used from votes v where v.event_id = e.id and v.category_id = n.category_id and v.voter = phone and not v.void and v.created_at >= since;
    if used >= e.free_votes_per_voter then
      return 'You have no free votes left in ' || ussd_cut((select name from categories where id = n.category_id), 30) || case when e.free_period = 'daily' then '. Try again tomorrow.' else '.' end;
    end if;
    fl := burst_flag('ussd:' || phone);
    insert into votes (event_id, category_id, nominee_id, qty, voter, channel, round, device, flagged, is_test)
    values (e.id, n.category_id, n.id, 1, phone, 'ussd', (e.rounds->>'current')::int, 'ussd:' || phone, fl, test_mode());
    msg := 'MyVoteHub: your free vote for ' || ussd_cut(n.name, 30) || ' (' || n.code || ') in ' || ussd_cut(e.title, 30) || ' is counted. Thank you!';
    insert into sms_log (phone, message, event_id) values (phone, msg, e.id);
    return 'Thank you! Your free vote for ' || ussd_cut(n.name) || ' is counted.';
  end if;
  if not test_mode() then
    -- Live MoMo checkout through the USSD provider comes with the payments step.
    return 'Paying by USSD is coming soon. Vote for ' || n.code || ' online at MyVoteHub.';
  end if;
  select * into r from cast_test_vote(nid, qty, 'momo', phone, 'ussd:' || phone);
  if r.status <> 'success' then return 'Payment declined. No money was taken. Please try again.'; end if;
  update votes set channel = 'ussd' where payment_id = (select id from payments where ref = r.ref);
  update payments set method = 'momo' where ref = r.ref;
  msg := 'MyVoteHub: ' || qty || ' vote' || case when qty > 1 then 's' else '' end || ' for ' || ussd_cut(n.name, 30) || ' (' || n.code || ') received. '
    || ussd_cedi(r.amount) || ' TEST - no money charged. Ref ' || r.ref;
  insert into sms_log (phone, message, event_id) values (phone, msg, e.id);
  return 'TEST MODE - no money charged.' || E'\n' || qty || ' vote' || case when qty > 1 then 's' else '' end || ' for ' || ussd_cut(n.name) || ' added.' || E'\nRef ' || r.ref;
end $$;

-- ---------------------------------------------------------------- the menu
-- One step of a USSD session: takes the user's latest input ('' when the session starts)
-- and returns the next screen and whether the session ends.
create or replace function ussd_step(sid text, msisdn text, input text)
returns table (message text, done boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  ph text := ussd_phone(msisdn);
  st jsonb; scr text; inp text := trim(coalesce(input, '')); ch int; pg int;
  ids uuid[]; labels text[]; n nominees; e events; cats categories[]; b jsonb; amt numeric; q int; cnt int;
  home text := E'Welcome to MyVoteHub\n1. Vote with nominee code\n2. Browse events\n3. Check votes\n0. Exit';
begin
  delete from ussd_sessions where updated_at < now() - interval '1 day';
  select s.state into st from ussd_sessions s where s.id = sid;
  if st is null or inp = '' and st->>'screen' = 'home' then
    insert into ussd_sessions (id, phone, state) values (sid, ph, '{"screen":"home"}')
    on conflict (id) do update set state = '{"screen":"home"}', updated_at = now();
    if st is null or inp = '' then return query select home, false; return; end if;
  end if;
  scr := st->>'screen';
  ch := case when inp ~ '^\d{1,5}$' then inp::int end;
  pg := coalesce((st->>'page')::int, 0);

  -- Shared helpers as inline blocks below; each branch sets st and returns a screen.
  if scr = 'home' then
    if ch = 1 then st := '{"screen":"code"}'; message := 'Enter the nominee code (e.g. AOY-01):' || E'\n0. Back';
    elsif ch = 2 then st := '{"screen":"events","page":0}';
    elsif ch = 3 then st := '{"screen":"check"}'; message := 'Enter the nominee code to check votes:' || E'\n0. Back';
    elsif ch = 0 then delete from ussd_sessions where id = sid; return query select 'Thank you for using MyVoteHub.', true; return;
    else message := 'Invalid choice.' || E'\n' || home; end if;

  elsif scr in ('code', 'check') then
    if ch = 0 then st := '{"screen":"home"}'; message := home;
    else
      select array_agg(x.id order by x.end_at), count(*) into ids, cnt from (
        select nm.id, ev.end_at from nominees nm join ussd_live_events() ev on ev.id = nm.event_id
        where upper(nm.code) = upper(replace(inp, ' ', ''))
          and (scr = 'check' or nm.status <> 'evicted')) x;
      if cnt = 0 then
        message := 'No live nominee has code ' || upper(inp) || '. Check the code and try again:' || E'\n0. Back';
      elsif cnt > 1 then
        select array_agg(ussd_cut(ev.title, 28) order by ev.end_at) into labels from nominees nm join events ev on ev.id = nm.event_id where nm.id = any(ids);
        st := jsonb_build_object('screen', 'pick', 'ids', to_jsonb(ids), 'mode', scr);
        message := 'Which event?' || E'\n' || ussd_page(labels, 0, 8);
      elsif scr = 'check' then
        select * into n from nominees where id = ids[1];
        select * into e from events where id = n.event_id;
        if e.show_counts or e.show_leaderboard then
          delete from ussd_sessions where id = sid;
          return query select ussd_cut(n.name, 30) || ' (' || n.code || ') has ' || to_char(ussd_votes_for(n, e), 'FM999,999,990') || ' votes'
            || coalesce(' in ' || (select r->>'label' from jsonb_array_elements(coalesce(e.rounds->'list', '[]')) r where (r->>'n')::int = (e.rounds->>'current')::int), '') || '.', true;
          return;
        end if;
        delete from ussd_sessions where id = sid;
        return query select 'Vote counts for ' || ussd_cut(e.title, 30) || ' are hidden until the results are announced.', true; return;
      else
        st := jsonb_build_object('screen', 'vote', 'nid', ids[1]);
      end if;
    end if;

  elsif scr = 'pick' then
    if ch = 0 then st := '{"screen":"home"}'; message := home;
    elsif ch between 1 and jsonb_array_length(st->'ids') then
      if st->>'mode' = 'check' then
        select * into n from nominees where id = (st->'ids'->>(ch - 1))::uuid;
        select * into e from events where id = n.event_id;
        delete from ussd_sessions where id = sid;
        return query select case when e.show_counts or e.show_leaderboard
          then ussd_cut(n.name, 30) || ' has ' || to_char(ussd_votes_for(n, e), 'FM999,999,990') || ' votes.'
          else 'Vote counts for this event are hidden until the results are announced.' end, true;
        return;
      end if;
      st := jsonb_build_object('screen', 'vote', 'nid', st->'ids'->>(ch - 1));
    else message := 'Invalid choice. Enter a number from the list.'; end if;

  elsif scr = 'events' then
    if ch = 0 then st := '{"screen":"home"}'; message := home;
    elsif ch = 9 and inp <> '' then st := jsonb_set(st, '{page}', to_jsonb(pg + 1)); pg := pg + 1;
    elsif ch between 1 and 5 then
      select array_agg(id) into ids from (select id from ussd_live_events() offset pg * 5 limit 5) x;
      if ids is not null and ch <= array_length(ids, 1) then
        -- Skip the category list when there is only one.
        if (select count(*) from categories where event_id = ids[ch]) = 1 then
          st := jsonb_build_object('screen', 'noms', 'cid', (select id from categories where event_id = ids[ch]), 'page', 0, 'back', jsonb_build_object('screen', 'events', 'page', pg));
        else
          st := jsonb_build_object('screen', 'cats', 'eid', ids[ch], 'page', 0, 'back', jsonb_build_object('screen', 'events', 'page', pg));
        end if;
      end if;
    end if;

  elsif scr = 'cats' then
    if ch = 0 then st := st->'back';
    elsif ch = 9 then st := jsonb_set(st, '{page}', to_jsonb(pg + 1));
    elsif ch between 1 and 5 then
      select array_agg(id order by sort, name) into ids from (select id, sort, name from categories where event_id = (st->>'eid')::uuid order by sort, name offset pg * 5 limit 5) x;
      if ids is not null and ch <= array_length(ids, 1) then
        st := jsonb_build_object('screen', 'noms', 'cid', ids[ch], 'page', 0, 'back', st);
      end if;
    end if;

  elsif scr = 'noms' then
    if ch = 0 then st := st->'back';
    elsif ch = 9 then st := jsonb_set(st, '{page}', to_jsonb(pg + 1));
    elsif ch between 1 and 5 then
      select array_agg(id order by code) into ids from (select id, code from nominees where category_id = (st->>'cid')::uuid and status <> 'evicted' order by code offset pg * 5 limit 5) x;
      if ids is not null and ch <= array_length(ids, 1) then
        st := jsonb_build_object('screen', 'vote', 'nid', ids[ch], 'back', st);
      end if;
    end if;

  elsif scr = 'vote' then
    select * into n from nominees where id = (st->>'nid')::uuid;
    select * into e from events where id = n.event_id;
    if ch = 0 then st := coalesce(st->'back', '{"screen":"home"}'::jsonb); if st->>'screen' = 'home' then message := home; end if;
    elsif e.voting_mode = 'free' then
      if ch = 1 then
        delete from ussd_sessions where id = sid;
        return query select ussd_cast(ph, n.id, 1), true; return;
      end if;
    else
      cnt := least(jsonb_array_length(e.bundles), 4);
      if ch between 1 and cnt then
        b := e.bundles->(ch - 1);
        st := jsonb_build_object('screen', 'confirm', 'nid', n.id, 'qty', (b->>'votes')::int, 'back', st);
      elsif ch = cnt + 1 then
        st := jsonb_build_object('screen', 'qty', 'nid', n.id, 'back', st);
        message := 'Enter number of votes (' || ussd_cedi(e.price_per_vote) || ' each):' || E'\n0. Back';
      end if;
    end if;

  elsif scr = 'qty' then
    if ch = 0 then st := st->'back';
    elsif ch between 1 and 10000 then st := jsonb_build_object('screen', 'confirm', 'nid', st->>'nid', 'qty', ch, 'back', st->'back');
    else message := 'Enter a number from 1 to 10,000:' || E'\n0. Back'; end if;

  elsif scr = 'confirm' then
    if ch = 1 then
      delete from ussd_sessions where id = sid;
      return query select ussd_cast(ph, (st->>'nid')::uuid, (st->>'qty')::int), true; return;
    elsif ch in (0, 2) then st := st->'back';
    end if;
  end if;

  -- Draw the screen for the (possibly new) state unless a message was set above.
  if message is null then
    scr := st->>'screen'; pg := coalesce((st->>'page')::int, 0);
    if scr = 'home' then message := home;
    elsif scr = 'events' then
      select array_agg(ussd_cut(title, 28)) into labels from (select title from ussd_live_events() offset pg * 5 limit 5) x;
      if labels is null and pg > 0 then pg := 0; st := '{"screen":"events","page":0}'; select array_agg(ussd_cut(title, 28)) into labels from (select title from ussd_live_events() limit 5) x; end if;
      if labels is null then message := 'No events are open for voting right now.' || E'\n0. Back';
      else
        message := 'Choose an event:' || E'\n' || ussd_page(labels, 0);
        if (select count(*) from ussd_live_events()) > (pg + 1) * 5 and message not like '%9. More%' then message := replace(message, '0. Back', E'9. More\n0. Back'); end if;
      end if;
    elsif scr = 'cats' then
      select array_agg(ussd_cut(name, 28) order by sort, name) into labels from (select name, sort from categories where event_id = (st->>'eid')::uuid order by sort, name offset pg * 5 limit 6) x;
      message := 'Choose a category:' || E'\n' || ussd_page(labels, 0);
    elsif scr = 'noms' then
      select array_agg(ussd_cut(name, 22) || ' ' || code order by code) into labels from (select name, code from nominees where category_id = (st->>'cid')::uuid and status <> 'evicted' order by code offset pg * 5 limit 6) x;
      message := 'Choose a nominee:' || E'\n' || ussd_page(coalesce(labels, '{}'), 0);
    elsif scr = 'vote' then
      select * into n from nominees where id = (st->>'nid')::uuid;
      select * into e from events where id = n.event_id;
      if e.voting_mode = 'free' then
        message := 'Vote for ' || ussd_cut(n.name) || ' (' || n.code || ')' || E'\n' || ussd_cut(e.title, 30) || E'\n1. Cast my free vote\n0. Back';
      else
        select string_agg((i) || '. ' || (bb->>'votes') || ' vote' || case when (bb->>'votes')::int > 1 then 's' else '' end || ' ' || ussd_cedi((bb->>'price')::numeric), E'\n' order by i)
          into message from jsonb_array_elements(e.bundles) with ordinality as t(bb, i) where i <= 4;
        message := 'Vote for ' || ussd_cut(n.name) || ' (' || n.code || ')' || E'\n' || coalesce(message || E'\n', '')
          || (least(jsonb_array_length(e.bundles), 4) + 1) || E'. Other amount\n0. Back';
      end if;
    elsif scr = 'confirm' then
      select * into n from nominees where id = (st->>'nid')::uuid;
      select * into e from events where id = n.event_id;
      q := (st->>'qty')::int;
      amt := coalesce((select (bb->>'price')::numeric from jsonb_array_elements(e.bundles) bb where (bb->>'votes')::int = q limit 1), q * e.price_per_vote);
      message := 'Pay ' || ussd_cedi(amt) || ' for ' || q || ' vote' || case when q > 1 then 's' else '' end || ' for ' || ussd_cut(n.name) || '?'
        || case when test_mode() then E'\n(TEST MODE - no charge)' else '' end || E'\n1. Confirm\n2. Cancel';
    else
      message := home; st := '{"screen":"home"}';
    end if;
  end if;

  update ussd_sessions set state = st, updated_at = now() where id = sid;
  return query select message, false;
exception when others then
  -- Event closed mid-session, nominee evicted, etc.
  delete from ussd_sessions where id = sid;
  return query select ussd_cut(sqlerrm, 120), true;
end $$;

-- The engine is for the USSD Edge Function (service role) only.
revoke execute on function ussd_step(text, text, text), ussd_cast(text, uuid, int) from public, anon, authenticated;

-- Admin app simulator: same engine, admins only, sessions prefixed so they never clash with real ones.
create or replace function ussd_simulate(sid text, msisdn text, input text) returns table (message text, done boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can use the simulator'; end if;
  return query select * from ussd_step('sim:' || sid, msisdn, input);
end $$;

create or replace function set_ussd_code(code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super() then raise exception 'Only a Super Admin can do this'; end if;
  update settings set ussd_code = nullif(trim(code), '');
  perform audit('USSD code set', coalesce(nullif(trim(code), ''), 'none'));
end $$;

grant execute on function nominee_dashboard(text) to anon, authenticated;
alter publication supabase_realtime add table sms_log;
