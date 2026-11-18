-- Editable USSD flow.
-- Admins: menu wording, main-menu options (on/off + order), featured / hidden events.
-- Organisers (per event): show on USSD, which bundles appear, "Other amount", a short greeting.

alter table settings add column ussd_config jsonb not null default '{}';
alter table events add column ussd_enabled boolean not null default true;       -- organiser
alter table events add column ussd_bundles jsonb;                                -- organiser; null = first 4 web bundles
alter table events add column ussd_other_amount boolean not null default true;   -- organiser
alter table events add column ussd_greeting text check (length(ussd_greeting) <= 60);  -- organiser
alter table events add column ussd_featured int;                                 -- admin: pinned order (1 = top)
alter table events add column ussd_hidden boolean not null default false;        -- admin: hidden from USSD

-- Organisers may not pin or hide events on USSD (admins do that).
create or replace function guard_event_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or auth.uid() is null then
    if new.status = 'pending' and new.status <> old.status and not (select require_event_approval from settings) then new.status := 'approved'; end if;
    return new;
  end if;
  if new.status <> old.status and not (
       (old.status in ('draft', 'rejected') and new.status = 'pending')
    or (old.status in ('approved', 'closed') and new.status = 'live')
    or (old.status = 'live' and new.status = 'closed')
  ) then
    raise exception 'Event status % → % needs MyVoteHub approval', old.status, new.status;
  end if;
  if new.ussd_featured is distinct from old.ussd_featured or new.ussd_hidden <> old.ussd_hidden then
    raise exception 'Only MyVoteHub admins can feature or hide events on USSD';
  end if;
  if new.status = 'pending' and not (select require_event_approval from settings) then new.status := 'approved'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- wording
create or replace function ussd_default_texts() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'welcome', 'Welcome to MyVoteHub',
    'opt_code', 'Vote with nominee code',
    'opt_browse', 'Browse events',
    'opt_check', 'Check votes',
    'opt_exit', 'Exit',
    'enter_code', 'Enter the nominee code (e.g. AOY-01):',
    'check_prompt', 'Enter the nominee code to check votes:',
    'no_code', 'No live nominee has code {code}. Check the code and try again:',
    'choose_event', 'Choose an event:',
    'choose_category', 'Choose a category:',
    'choose_nominee', 'Choose a nominee:',
    'no_events', 'No events are open for voting right now.',
    'vote_title', 'Vote for {name} ({code})',
    'free_option', 'Cast my free vote',
    'other_amount', 'Other amount',
    'confirm', 'Pay {amount} for {qty} votes for {name}?',
    'done_paid', '{qty} votes for {name} added.',
    'done_free', 'Thank you! Your free vote for {name} is counted.',
    'votes_count', '{name} ({code}) has {votes} votes.',
    'counts_hidden', 'Vote counts for {event} are hidden until the results are announced.',
    'sms_paid', 'MyVoteHub: {qty} votes for {name} ({code}) received. {amount}. Ref {ref}',
    'sms_free', 'MyVoteHub: your free vote for {name} ({code}) in {event} is counted. Thank you!',
    'goodbye', 'Thank you for using MyVoteHub.'
  );
$$;

create or replace function ussd_options() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(nullif(ussd_config->'options', 'null'::jsonb), '[{"key":"code","on":true},{"key":"browse","on":true},{"key":"check","on":true}]'::jsonb) from settings;
$$;

-- A message with {placeholders} filled in. Admin wording wins; blank falls back to the default.
create or replace function ussd_t(k text, vars jsonb default '{}') returns text
language plpgsql stable security definer set search_path = public as $$
declare s text; kv record;
begin
  select coalesce(nullif(trim(ussd_config->'texts'->>k), ''), ussd_default_texts()->>k) into s from settings;
  for kv in select * from jsonb_each_text(vars) loop
    s := replace(s, '{' || kv.key || '}', coalesce(kv.value, ''));
  end loop;
  return s;
end $$;

-- The main menu: enabled options in the admin's order, then "0. Exit". Returns the text and the option keys by number.
create or replace function ussd_home() returns table (txt text, keys text[]) language plpgsql stable security definer set search_path = public as $$
declare o jsonb; i int := 0; k text[] := '{}'; s text := ussd_t('welcome');
begin
  for o in select * from jsonb_array_elements(ussd_options()) loop
    if coalesce((o->>'on')::boolean, true) then
      i := i + 1; k := k || (o->>'key');
      s := s || E'\n' || i || '. ' || ussd_t('opt_' || (o->>'key'));
    end if;
  end loop;
  return query select s || E'\n0. ' || ussd_t('opt_exit'), k;
end $$;

create or replace function set_ussd_config(cfg jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can do this'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(cfg->'options', '[]')) o where coalesce((o->>'on')::boolean, true)) and cfg ? 'options' then
    raise exception 'Keep at least one menu option switched on';
  end if;
  for t in select * from jsonb_each_text(coalesce(cfg->'texts', '{}')) loop
    if length(t.value) > 160 then raise exception 'The "%" text is longer than 160 characters', t.key; end if;
  end loop;
  update settings set ussd_config = cfg where id;
  perform audit('USSD menu updated', null);
end $$;

-- ---------------------------------------------------------------- what USSD shows
create or replace function ussd_live_events() returns setof events language sql stable security definer set search_path = public as $$
  select e.* from events e join companies c on c.id = e.company_id
  where e.status = 'live' and now() >= e.start_at and now() < e.end_at and c.status = 'active'
    and e.ussd_enabled and not e.ussd_hidden
  order by e.ussd_featured nulls last, e.end_at;
$$;

-- The bundles USSD offers for an event (at most 4).
create or replace function ussd_bundles(e events) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(b order by i), '[]') from jsonb_array_elements(coalesce(e.ussd_bundles, e.bundles)) with ordinality t(b, i) where i <= 4;
$$;

-- ---------------------------------------------------------------- casting (wording from settings)
create or replace function ussd_cast(phone text, nid uuid, qty int) returns text
language plpgsql security definer set search_path = public as $$
declare n nominees; e events; r record; used int; since timestamptz; fl text; vars jsonb;
begin
  select * into n from nominees where id = nid;
  select * into e from events where id = n.event_id;
  perform check_votable(e, n);
  vars := jsonb_build_object('name', ussd_cut(n.name, 30), 'code', n.code, 'event', ussd_cut(e.title, 30), 'qty', qty);
  if e.voting_mode = 'free' then
    since := case when e.free_period = 'daily' then date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra' else '-infinity'::timestamptz end;
    select coalesce(sum(v.qty), 0) into used from votes v where v.event_id = e.id and v.category_id = n.category_id and v.voter = phone and not v.void and v.created_at >= since;
    if used >= e.free_votes_per_voter then
      return 'You have no free votes left in ' || ussd_cut((select name from categories where id = n.category_id), 30) || case when e.free_period = 'daily' then '. Try again tomorrow.' else '.' end;
    end if;
    fl := burst_flag('ussd:' || phone);
    insert into votes (event_id, category_id, nominee_id, qty, voter, channel, round, device, flagged, is_test)
    values (e.id, n.category_id, n.id, 1, phone, 'ussd', (e.rounds->>'current')::int, 'ussd:' || phone, fl, test_mode());
    insert into sms_log (phone, message, event_id) values (phone, ussd_t('sms_free', vars), e.id);
    return ussd_t('done_free', vars);
  end if;
  if not test_mode() then
    return 'Paying by USSD is coming soon. Vote for ' || n.code || ' online at MyVoteHub.';
  end if;
  select * into r from cast_test_vote(nid, qty, 'momo', phone, 'ussd:' || phone);
  if r.status <> 'success' then return 'Payment declined. No money was taken. Please try again.'; end if;
  update votes set channel = 'ussd' where payment_id = (select id from payments where ref = r.ref);
  vars := vars || jsonb_build_object('ref', r.ref, 'amount', ussd_cedi(r.amount) || ' TEST - no money charged');
  insert into sms_log (phone, message, event_id) values (phone, ussd_t('sms_paid', vars), e.id);
  return 'TEST MODE - no money charged.' || E'\n' || ussd_t('done_paid', vars) || E'\nRef ' || r.ref;
end $$;

-- ---------------------------------------------------------------- the menu
create or replace function ussd_step(sid text, msisdn text, input text)
returns table (message text, done boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  ph text := ussd_phone(msisdn);
  st jsonb; scr text; inp text := trim(coalesce(input, '')); ch int; pg int;
  ids uuid[]; labels text[]; n nominees; e events; b jsonb; bun jsonb; amt numeric; q int; cnt int;
  home text; hkeys text[]; pick text; vars jsonb; greet text;
begin
  select h.txt, h.keys into home, hkeys from ussd_home() h;
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

  if scr = 'home' then
    pick := case when ch between 1 and coalesce(array_length(hkeys, 1), 0) then hkeys[ch] end;
    if pick = 'code' then st := '{"screen":"code"}'; message := ussd_t('enter_code') || E'\n0. Back';
    elsif pick = 'browse' then st := '{"screen":"events","page":0}';
    elsif pick = 'check' then st := '{"screen":"check"}'; message := ussd_t('check_prompt') || E'\n0. Back';
    elsif ch = 0 then delete from ussd_sessions where id = sid; return query select ussd_t('goodbye'), true; return;
    else message := 'Invalid choice.' || E'\n' || home; end if;

  elsif scr in ('code', 'check') then
    if ch = 0 then st := '{"screen":"home"}'; message := home;
    else
      select array_agg(x.id order by x.ord), count(*) into ids, cnt from (
        select nm.id, row_number() over () ord from nominees nm join ussd_live_events() ev on ev.id = nm.event_id
        where upper(nm.code) = upper(replace(inp, ' ', '')) and (scr = 'check' or nm.status <> 'evicted')) x;
      if cnt = 0 then
        message := ussd_t('no_code', jsonb_build_object('code', upper(inp))) || E'\n0. Back';
      elsif cnt > 1 then
        select array_agg(ussd_cut(ev.title, 28) order by array_position(ids, nm.id)) into labels from nominees nm join events ev on ev.id = nm.event_id where nm.id = any(ids);
        st := jsonb_build_object('screen', 'pick', 'ids', to_jsonb(ids), 'mode', scr);
        message := 'Which event?' || E'\n' || ussd_page(labels, 0, 8);
      elsif scr = 'check' then
        select * into n from nominees where id = ids[1];
        select * into e from events where id = n.event_id;
        delete from ussd_sessions where id = sid;
        vars := jsonb_build_object('name', ussd_cut(n.name, 30), 'code', n.code, 'event', ussd_cut(e.title, 30), 'votes', to_char(ussd_votes_for(n, e), 'FM999,999,990'));
        return query select case when e.show_counts or e.show_leaderboard then ussd_t('votes_count', vars) else ussd_t('counts_hidden', vars) end, true;
        return;
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
        vars := jsonb_build_object('name', ussd_cut(n.name, 30), 'code', n.code, 'event', ussd_cut(e.title, 30), 'votes', to_char(ussd_votes_for(n, e), 'FM999,999,990'));
        return query select case when e.show_counts or e.show_leaderboard then ussd_t('votes_count', vars) else ussd_t('counts_hidden', vars) end, true;
        return;
      end if;
      st := jsonb_build_object('screen', 'vote', 'nid', st->'ids'->>(ch - 1));
    else message := 'Invalid choice. Enter a number from the list.'; end if;

  elsif scr = 'events' then
    if ch = 0 then st := '{"screen":"home"}'; message := home;
    elsif ch = 9 then st := jsonb_set(st, '{page}', to_jsonb(pg + 1));
    elsif ch between 1 and 5 then
      select array_agg(id) into ids from (select id from ussd_live_events() offset pg * 5 limit 5) x;
      if ids is not null and ch <= array_length(ids, 1) then
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
      if ids is not null and ch <= array_length(ids, 1) then st := jsonb_build_object('screen', 'noms', 'cid', ids[ch], 'page', 0, 'back', st); end if;
    end if;

  elsif scr = 'noms' then
    if ch = 0 then st := st->'back';
    elsif ch = 9 then st := jsonb_set(st, '{page}', to_jsonb(pg + 1));
    elsif ch between 1 and 5 then
      select array_agg(id order by code) into ids from (select id, code from nominees where category_id = (st->>'cid')::uuid and status <> 'evicted' order by code offset pg * 5 limit 5) x;
      if ids is not null and ch <= array_length(ids, 1) then st := jsonb_build_object('screen', 'vote', 'nid', ids[ch], 'back', st); end if;
    end if;

  elsif scr = 'vote' then
    select * into n from nominees where id = (st->>'nid')::uuid;
    select * into e from events where id = n.event_id;
    if ch = 0 then st := coalesce(st->'back', '{"screen":"home"}'::jsonb); if st->>'screen' = 'home' then message := home; end if;
    elsif e.voting_mode = 'free' then
      if ch = 1 then delete from ussd_sessions where id = sid; return query select ussd_cast(ph, n.id, 1), true; return; end if;
    else
      bun := ussd_bundles(e); cnt := jsonb_array_length(bun);
      if ch between 1 and cnt then
        st := jsonb_build_object('screen', 'confirm', 'nid', n.id, 'qty', (bun->(ch - 1)->>'votes')::int, 'back', st);
      elsif ch = cnt + 1 and e.ussd_other_amount then
        st := jsonb_build_object('screen', 'qty', 'nid', n.id, 'back', st);
        message := 'Enter number of votes (' || ussd_cedi(e.price_per_vote) || ' each):' || E'\n0. Back';
      end if;
    end if;

  elsif scr = 'qty' then
    if ch = 0 then st := st->'back';
    elsif ch between 1 and 10000 then st := jsonb_build_object('screen', 'confirm', 'nid', st->>'nid', 'qty', ch, 'back', st->'back');
    else message := 'Enter a number from 1 to 10,000:' || E'\n0. Back'; end if;

  elsif scr = 'confirm' then
    if ch = 1 then delete from ussd_sessions where id = sid; return query select ussd_cast(ph, (st->>'nid')::uuid, (st->>'qty')::int), true; return;
    elsif ch in (0, 2) then st := st->'back';
    end if;
  end if;

  if message is null then
    scr := st->>'screen'; pg := coalesce((st->>'page')::int, 0);
    if scr = 'home' then message := home;
    elsif scr = 'events' then
      select array_agg(ussd_cut(title, 28)) into labels from (select title from ussd_live_events() offset pg * 5 limit 6) x;
      if labels is null and pg > 0 then
        pg := 0; st := '{"screen":"events","page":0}';
        select array_agg(ussd_cut(title, 28)) into labels from (select title from ussd_live_events() limit 6) x;
      end if;
      message := case when labels is null then ussd_t('no_events') || E'\n0. Back' else ussd_t('choose_event') || E'\n' || ussd_page(labels, 0) end;
    elsif scr = 'cats' then
      select array_agg(ussd_cut(name, 28) order by sort, name) into labels from (select name, sort from categories where event_id = (st->>'eid')::uuid order by sort, name offset pg * 5 limit 6) x;
      message := ussd_t('choose_category') || E'\n' || ussd_page(coalesce(labels, '{}'), 0);
    elsif scr = 'noms' then
      select array_agg(ussd_cut(name, 22) || ' ' || code order by code) into labels from (select name, code from nominees where category_id = (st->>'cid')::uuid and status <> 'evicted' order by code offset pg * 5 limit 6) x;
      message := ussd_t('choose_nominee') || E'\n' || ussd_page(coalesce(labels, '{}'), 0);
    elsif scr = 'vote' then
      select * into n from nominees where id = (st->>'nid')::uuid;
      select * into e from events where id = n.event_id;
      vars := jsonb_build_object('name', ussd_cut(n.name), 'code', n.code, 'event', ussd_cut(e.title, 30));
      greet := case when nullif(trim(e.ussd_greeting), '') is not null then trim(e.ussd_greeting) || E'\n' else '' end;
      if e.voting_mode = 'free' then
        message := greet || ussd_t('vote_title', vars) || E'\n1. ' || ussd_t('free_option') || E'\n0. Back';
      else
        bun := ussd_bundles(e);
        select string_agg(i || '. ' || (bb->>'votes') || ' vote' || case when (bb->>'votes')::int > 1 then 's' else '' end || ' ' || ussd_cedi((bb->>'price')::numeric), E'\n' order by i)
          into message from jsonb_array_elements(bun) with ordinality as t(bb, i);
        message := greet || ussd_t('vote_title', vars) || E'\n' || coalesce(message || E'\n', '')
          || case when e.ussd_other_amount then (jsonb_array_length(bun) + 1) || '. ' || ussd_t('other_amount') || E'\n' else '' end || '0. Back';
      end if;
    elsif scr = 'confirm' then
      select * into n from nominees where id = (st->>'nid')::uuid;
      select * into e from events where id = n.event_id;
      q := (st->>'qty')::int;
      amt := coalesce((select (bb->>'price')::numeric from jsonb_array_elements(coalesce(e.ussd_bundles, e.bundles)) bb where (bb->>'votes')::int = q limit 1), q * e.price_per_vote);
      message := ussd_t('confirm', jsonb_build_object('amount', ussd_cedi(amt), 'qty', q, 'name', ussd_cut(n.name), 'code', n.code))
        || case when test_mode() then E'\n(TEST MODE - no charge)' else '' end || E'\n1. Confirm\n2. Cancel';
    else
      message := home; st := '{"screen":"home"}';
    end if;
  end if;

  update ussd_sessions set state = st, updated_at = now() where id = sid;
  return query select message, false;
exception when others then
  delete from ussd_sessions where id = sid;
  return query select ussd_cut(sqlerrm, 120), true;
end $$;

revoke execute on function ussd_step(text, text, text), ussd_cast(text, uuid, int) from public, anon, authenticated;
