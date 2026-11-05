-- MyVoteHub accounts: every account waits for Super Admin approval; test-mode voting;
-- server-side free-vote codes; account management for the Admin app.

-- ---------------------------------------------------------------- columns
alter table settings add column test_mode boolean not null default true;
alter table settings add column reserved_admin_email text not null default 'nyamebabaku@gmail.com';

alter table profiles drop constraint profiles_status_check;
alter table profiles alter column status set default 'pending';
alter table profiles add constraint profiles_status_check check (status in ('pending', 'active', 'suspended', 'deactivated'));
alter table profiles add column super boolean not null default false;
alter table profiles add column phone text;
alter table profiles add column status_reason text;
alter table profiles add column approved_at timestamptz;

alter table companies drop constraint companies_status_check;
alter table companies add constraint companies_status_check check (status in ('pending', 'active', 'suspended', 'deactivated'));
alter table companies add column owner_id uuid references profiles on delete set null;
alter table companies add column join_code text unique;
alter table companies add column status_reason text;

alter table payments add column is_test boolean not null default false;
alter table votes add column is_test boolean not null default false;
alter table withdrawals add column is_test boolean not null default false;

alter table otp_codes add column created_at timestamptz not null default now();

-- ---------------------------------------------------------------- helpers
create or replace function is_active() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;
create or replace function is_super() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and super and status = 'active');
$$;
-- Organisers act for their company only while both they and the company are active.
create or replace function my_company() returns uuid language sql stable security definer set search_path = public as $$
  select p.company_id from profiles p join companies c on c.id = p.company_id
  where p.id = auth.uid() and p.role = 'organiser' and p.status = 'active' and c.status = 'active';
$$;
create or replace function test_mode() returns boolean language sql stable security definer set search_path = public as $$
  select test_mode from settings;
$$;
create or replace function new_join_code() returns text language plpgsql as $$
declare c text;
begin
  loop
    c := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', ''), 1, 6));
    exit when length(c) = 6 and not exists (select 1 from companies where join_code = c);
  end loop;
  return c;
end $$;
create or replace function audit(act text, det text, cid uuid default null, eid uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (user_id, company_id, event_id, action, detail) values (auth.uid(), cid, eid, act, det);
$$;

-- ---------------------------------------------------------------- sign-up (everyone starts pending)
create or replace function my_profile() returns profiles language sql stable security definer set search_path = public as $$
  select * from profiles where id = auth.uid();
$$;

create or replace function register_company(company jsonb, full_name text, job_title text default null, phone text default null)
returns profiles language plpgsql security definer set search_path = public as $$
declare cid uuid; p profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'This account is already registered'; end if;
  insert into companies (name, industry, email, phone, city, logo_url, kyc, kyc_docs, status, commission_pct, payout, join_code)
  values (company->>'name', company->>'industry', company->>'email', company->>'phone', company->>'city', company->>'logo',
          'submitted', coalesce(company->'kycDocs', '{}'), 'pending', (select default_commission from settings),
          coalesce(company->'payout', '{}'), new_join_code())
  returning id into cid;
  insert into profiles (id, role, company_id, name, title, email, phone, status)
  values (auth.uid(), 'organiser', cid, full_name, coalesce(job_title, 'Owner'), auth.email(), phone, 'pending') returning * into p;
  update companies set owner_id = p.id where id = cid;
  perform audit('Company onboarded', (company->>'name') || ' applied (KYC submitted)', cid);
  insert into notifications (to_role, title, body, link) values ('admin', 'New company to approve', company->>'name', '/app/accounts');
  return p;
end $$;

create or replace function company_by_code(code text) returns table (id uuid, name text) language sql stable security definer set search_path = public as $$
  select id, name from companies where join_code = upper(trim(code)) and status in ('pending', 'active');
$$;

create or replace function join_company(code text, member_role text, full_name text, job_title text default null, phone text default null)
returns profiles language plpgsql security definer set search_path = public as $$
declare cid uuid; cname text; p profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if member_role not in ('organiser', 'judge') then raise exception 'Choose team member or judge'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'This account is already registered'; end if;
  select c.id, c.name into cid, cname from company_by_code(code) c;
  if cid is null then raise exception 'No company has that code'; end if;
  insert into profiles (id, role, company_id, name, title, email, phone, status)
  values (auth.uid(), member_role, cid, full_name, coalesce(job_title, case member_role when 'judge' then 'Judge' else 'Team member' end), auth.email(), phone, 'pending')
  returning * into p;
  perform audit(case member_role when 'judge' then 'Judge signed up' else 'Team member signed up' end, full_name || ' → ' || cname, cid);
  insert into notifications (to_role, title, body, link) values ('admin', 'New account to approve', full_name || ' (' || cname || ')', '/app/accounts');
  insert into notifications (company_id, title, body, link) values (cid, 'New team sign-up', full_name || ' is waiting for MyVoteHub approval', '/app/team');
  return p;
end $$;

create or replace function request_admin(full_name text, phone text default null) returns profiles
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'This account is already registered'; end if;
  insert into profiles (id, role, name, title, email, phone, status)
  values (auth.uid(), 'admin', full_name, 'Platform admin', auth.email(), phone, 'pending') returning * into p;
  perform audit('Admin access requested', full_name || ' (' || auth.email() || ')');
  insert into notifications (to_role, title, body, link) values ('admin', 'Admin access requested', full_name, '/app/accounts');
  return p;
end $$;

create or replace function super_admin_exists() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where role = 'admin' and super);
$$;

-- Only the reserved email, and only while no Super Admin exists.
create or replace function claim_super_admin(full_name text) returns profiles
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if super_admin_exists() then raise exception 'A Super Admin already exists'; end if;
  if lower(auth.email()) <> lower((select reserved_admin_email from settings)) then raise exception 'This email is not the reserved Super Admin email'; end if;
  delete from profiles where id = auth.uid();
  insert into profiles (id, role, name, title, email, status, super, approved_at)
  values (auth.uid(), 'admin', full_name, 'Super Admin', auth.email(), 'active', true, now()) returning * into p;
  perform audit('Super Admin claimed', full_name);
  return p;
end $$;

-- ---------------------------------------------------------------- account management (Admin app)
create or replace function set_account_status(target uuid, new_status text, reason text default null) returns profiles
language plpgsql security definer set search_path = public as $$
declare t profiles;
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can do this'; end if;
  if new_status not in ('pending', 'active', 'suspended', 'deactivated') then raise exception 'Unknown status'; end if;
  if target = auth.uid() then raise exception 'You cannot change your own account'; end if;
  select * into t from profiles where id = target;
  if t.id is null then raise exception 'Account not found'; end if;
  if t.role = 'admin' and not is_super() then raise exception 'Only a Super Admin can manage admins'; end if;
  if t.super and new_status <> 'active' and (select count(*) from profiles where super and status = 'active' and id <> target) = 0 then
    raise exception 'The last Super Admin cannot be suspended';
  end if;
  update profiles set status = new_status, status_reason = reason,
    approved_at = case when new_status = 'active' and approved_at is null then now() else approved_at end
  where id = target returning * into t;
  -- Approving a company's owner also approves the company.
  if new_status = 'active' then
    update companies set status = 'active', kyc = 'verified' where owner_id = target and status = 'pending';
  end if;
  perform audit(case new_status when 'active' then 'Account activated' when 'suspended' then 'Account suspended'
                when 'deactivated' then 'Account deactivated' else 'Account set to pending' end,
                t.name || coalesce(' — ' || reason, ''), t.company_id);
  insert into notifications (user_id, title, body, link) values (target,
    case new_status when 'active' then 'Your account is approved ✅' when 'suspended' then 'Your account is suspended'
      when 'deactivated' then 'Your account is deactivated' else 'Your account is under review' end, reason, '/app');
  return t;
end $$;

create or replace function set_company_status(cid uuid, new_status text, reason text default null) returns companies
language plpgsql security definer set search_path = public as $$
declare c companies;
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can do this'; end if;
  if new_status not in ('pending', 'active', 'suspended', 'deactivated') then raise exception 'Unknown status'; end if;
  update companies set status = new_status, status_reason = reason, kyc = case when new_status = 'active' then 'verified' else kyc end
  where id = cid returning * into c;
  if new_status = 'active' then update profiles set status = 'active', approved_at = coalesce(approved_at, now()) where id = c.owner_id and status = 'pending'; end if;
  perform audit(case new_status when 'active' then 'Company verified' else 'Company ' || new_status end, c.name || coalesce(' — ' || reason, ''), cid);
  insert into notifications (company_id, title, body, link) values (cid, 'Company status: ' || new_status, reason, '/app');
  return c;
end $$;

create or replace function delete_account(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t profiles;
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can do this'; end if;
  if target = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  select * into t from profiles where id = target;
  if t.role = 'admin' and not is_super() then raise exception 'Only a Super Admin can delete admins'; end if;
  if t.super and (select count(*) from profiles where super and id <> target) = 0 then raise exception 'The last Super Admin cannot be deleted'; end if;
  perform audit('Account deleted', coalesce(t.name, target::text) || coalesce(' (' || t.email || ')', ''), t.company_id);
  update companies set owner_id = null where owner_id = target;
  delete from auth.users where id = target;
  delete from profiles where id = target;
end $$;

create or replace function set_admin_role(target uuid, make_super boolean) returns profiles
language plpgsql security definer set search_path = public as $$
declare t profiles;
begin
  if not is_super() then raise exception 'Only a Super Admin can do this'; end if;
  if target = auth.uid() then raise exception 'You cannot change your own role'; end if;
  update profiles set super = make_super where id = target and role = 'admin' returning * into t;
  if t.id is null then raise exception 'Not an admin account'; end if;
  perform audit(case when make_super then 'Made Super Admin' else 'Super Admin removed' end, t.name);
  return t;
end $$;

create or replace function set_test_mode(flag boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super() then raise exception 'Only a Super Admin can do this'; end if;
  update settings set test_mode = flag;
  perform audit(case when flag then 'Test mode on' else 'Test mode off — live payments only' end, null);
end $$;

create or replace function clear_test_data() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_super() then raise exception 'Only a Super Admin can do this'; end if;
  delete from votes where is_test;
  get diagnostics n = row_count;
  delete from payments where is_test;
  delete from withdrawals where is_test;
  perform audit('Test data cleared', n || ' vote records');
  return n;
end $$;

-- ---------------------------------------------------------------- voting (anon allowed, server decides)
create or replace function check_votable(e events, n nominees) returns void language plpgsql as $$
begin
  if e.id is null or n.id is null then raise exception 'Nominee not found'; end if;
  if e.status <> 'live' or now() < e.start_at or now() >= e.end_at then raise exception 'Voting is closed'; end if;
  if (select status from companies where id = e.company_id) <> 'active' then raise exception 'Voting is closed'; end if;
  if n.status = 'evicted' then raise exception 'This nominee has been evicted'; end if;
end $$;

create or replace function burst_flag(dev text) returns text language sql stable security definer set search_path = public as $$
  select case when dev is not null and (select count(*) from votes where device = dev and created_at > now() - interval '1 minute')
    >= (select max_votes_per_minute from settings) then 'Burst: too many vote actions in 60s from one device' end;
$$;

-- Simulated MoMo/card payment while test mode is on. Demo rule: a phone ending in 000 or a card ending in 0002 is declined.
create or replace function cast_test_vote(nid uuid, qty int, method text, voter text, device text default null)
returns table (ref text, status text, amount numeric, votes int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare e events; n nominees; c companies; amt numeric; pct numeric; com numeric; declined boolean; r text; pid uuid; fl text;
begin
  if not test_mode() then raise exception 'Live payments are not connected yet'; end if;
  select * into n from nominees where id = nid;
  select * into e from events where id = n.event_id;
  perform check_votable(e, n);
  if e.voting_mode <> 'paid' then raise exception 'This is a free vote'; end if;
  if qty < 1 or qty > 10000 then raise exception 'Choose between 1 and 10,000 votes'; end if;
  select * into c from companies where id = e.company_id;
  select coalesce((select (b->>'price')::numeric from jsonb_array_elements(e.bundles) b where (b->>'votes')::int = qty limit 1), qty * e.price_per_vote) into amt;
  amt := round(amt, 2);
  pct := c.commission_pct;
  declined := (method = 'card' and regexp_replace(voter, '\D', '', 'g') like '%0002') or (method <> 'card' and regexp_replace(voter, '\D', '', 'g') like '%000');
  com := case when declined then 0 else round(amt * pct / 100, 2) end;
  r := 'MVH' || (100000 + floor(random() * 900000))::int || chr(65 + floor(random() * 26)::int);
  insert into payments (ref, event_id, company_id, nominee_id, voter, method, amount, votes, commission_pct, commission, net, status, is_test, completed_at)
  values (r, e.id, e.company_id, n.id, voter, method, amt, qty, pct, com, case when declined then 0 else amt - com end,
          case when declined then 'failed' else 'success' end, true, now())
  returning id into pid;
  if not declined then
    fl := burst_flag(device);
    insert into votes (event_id, category_id, nominee_id, qty, voter, channel, payment_id, round, device, flagged, is_test)
    values (e.id, n.category_id, n.id, qty, voter, 'web', pid, (e.rounds->>'current')::int, device, fl, true);
  end if;
  return query select r, case when declined then 'failed' else 'success' end, amt, qty;
end $$;

-- Free votes: a 6-digit code per phone (hashed, 10 minutes to enter, 5 tries), valid 30 minutes once verified.
create or replace function request_free_vote_code(phone text) returns text
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare ph text := regexp_replace(phone, '\D', '', 'g'); code text;
begin
  if length(ph) < 10 then raise exception 'Enter a valid phone number'; end if;
  if exists (select 1 from otp_codes where otp_codes.phone = ph and created_at > now() - interval '30 seconds') then
    raise exception 'Please wait 30 seconds before asking for another code';
  end if;
  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into otp_codes (phone, code_hash, expires_at, attempts, created_at) values (ph, md5(ph || ':' || code), now() + interval '10 minutes', 0, now())
  on conflict (phone) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = now();
  -- Real SMS comes with the SMS step; in test mode the code is shown on screen.
  return case when test_mode() then code end;
end $$;

create or replace function cast_free_vote(phone text, code text, nid uuid, device text default null) returns int
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare ph text := regexp_replace(phone, '\D', '', 'g'); o otp_codes; e events; n nominees; used int; since timestamptz; fl text;
begin
  select * into o from otp_codes where otp_codes.phone = ph;
  if o.phone is null then raise exception 'Ask for a code first'; end if;
  if o.attempts >= 5 then raise exception 'Too many wrong codes. Ask for a new one'; end if;
  if o.code_hash <> md5(ph || ':' || code) then
    update otp_codes set attempts = attempts + 1 where otp_codes.phone = ph;
    raise exception 'Wrong code';
  end if;
  if now() > o.expires_at + interval '20 minutes' then raise exception 'Code expired. Ask for a new one'; end if;
  select * into n from nominees where id = nid;
  select * into e from events where id = n.event_id;
  perform check_votable(e, n);
  if e.voting_mode <> 'free' then raise exception 'This vote is paid'; end if;
  since := case when e.free_period = 'daily' then date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra' else '-infinity'::timestamptz end;
  select coalesce(sum(qty), 0) into used from votes where event_id = e.id and category_id = n.category_id and voter = ph and not void and created_at >= since;
  if used >= e.free_votes_per_voter then raise exception 'No free votes left in this category'; end if;
  fl := burst_flag(device);
  insert into votes (event_id, category_id, nominee_id, qty, voter, channel, round, device, flagged, is_test)
  values (e.id, n.category_id, n.id, 1, ph, 'web', (e.rounds->>'current')::int, device, fl, test_mode());
  return e.free_votes_per_voter - used - 1;
end $$;

-- Receipt lookup by reference, without exposing other payments.
create or replace function receipt(r text) returns table (ref text, amount numeric, votes int, method text, status text, voter text, created_at timestamptz, event_id uuid, nominee_id uuid, is_test boolean)
language sql stable security definer set search_path = public as $$
  select ref, amount, votes, method, status,
    case when voter like '%@%' or voter like 'card%' then voter else left(voter, 3) || '****' || right(voter, 3) end,
    created_at, event_id, nominee_id, is_test
  from payments where payments.ref = r;
$$;

-- Live counts for every public event's current round (the voter site polls this).
create or replace function public_tallies() returns table (event_id uuid, nominee_id uuid, category_id uuid, votes bigint)
language sql stable security definer set search_path = public as $$
  select v.event_id, v.nominee_id, v.category_id, sum(v.qty)::bigint
  from votes v join events e on e.id = v.event_id
  where e.status in ('approved', 'live', 'closed') and not v.void
    and (e.show_counts or e.show_leaderboard or e.results_released)
    and (v.is_test = false or test_mode())
    and (e.rounds is null
         or (coalesce((e.rounds->>'carryOver')::boolean, false) and coalesce(v.round, 1) <= (e.rounds->>'current')::int)
         or coalesce(v.round, 1) = (e.rounds->>'current')::int)
  group by v.event_id, v.nominee_id, v.category_id;
$$;

-- Judge averages for released events, for anyone who may see results.
create or replace function released_scores() returns table (event_id uuid, nominee_id uuid, judge_avg numeric, judges_in int)
language sql stable security definer set search_path = public as $$
  select s.event_id, s.nominee_id, avg(s.total), count(*)::int
  from scores s join events e on e.id = s.event_id
  where s.submitted and (e.results_released or is_admin())
  group by s.event_id, s.nominee_id;
$$;

-- ---------------------------------------------------------------- money
create or replace function wallet(cid uuid)
returns table (gross numeric, commission numeric, net numeric, paid_out numeric, pending numeric, available numeric, votes_sold bigint, tx_count bigint)
language sql stable security definer set search_path = public as $$
  with p as (select * from payments where company_id = cid and status = 'success' and (not is_test or test_mode())),
       w as (select * from withdrawals where company_id = cid and (not is_test or test_mode()))
  select coalesce(sum(p.amount), 0), coalesce(sum(p.commission), 0), coalesce(sum(p.net), 0),
    (select coalesce(sum(amount + fee), 0) from w where status = 'paid'),
    (select coalesce(sum(amount + fee), 0) from w where status in ('pending', 'processing')),
    greatest(0, coalesce(sum(p.net), 0) - (select coalesce(sum(amount + fee), 0) from w where status in ('paid', 'pending', 'processing'))),
    coalesce(sum(p.votes), 0), count(p.*)
  from p
  where is_admin() or cid = my_company();
$$;

create or replace function request_withdrawal(amt numeric, dest jsonb) returns withdrawals
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_company(); bal numeric; minw numeric; rec withdrawals; cname text;
begin
  if cid is null then raise exception 'Only approved organisers of an active company can withdraw'; end if;
  perform 1 from companies where id = cid for update;
  select available into bal from wallet(cid);
  select min_withdrawal into minw from settings;
  if amt < minw then raise exception 'Minimum withdrawal is %', minw; end if;
  if amt > bal then raise exception 'Only % is available', bal; end if;
  insert into withdrawals (company_id, amount, destination, requested_by, is_test) values (cid, amt, dest, auth.uid(), test_mode()) returning * into rec;
  select name into cname from companies where id = cid;
  perform audit('Withdrawal requested', amt::text || ' — ' || coalesce(dest->>'number', ''), cid);
  insert into notifications (to_role, title, body, link) values ('admin', 'Withdrawal awaiting approval', cname || ' · ' || amt::text, '/app/withdrawals');
  return rec;
end $$;

create or replace function decide_withdrawal(wid uuid, approve boolean, note text default null) returns withdrawals
language plpgsql security definer set search_path = public as $$
declare w withdrawals;
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can do this'; end if;
  select * into w from withdrawals where id = wid for update;
  if w.status <> 'pending' then raise exception 'Already decided'; end if;
  -- Live payouts through Hubtel Send Money come in the payments step; until then approval records the payout.
  update withdrawals set status = case when approve then 'paid' else 'rejected' end, note = decide_withdrawal.note,
    decided_by = auth.uid(), decided_at = now(),
    payout_ref = case when approve then (case when w.is_test then 'TEST' else 'MANUAL' end) || (10000000 + floor(random() * 90000000))::int end
  where id = wid returning * into w;
  perform audit(case when approve then 'Withdrawal paid' else 'Withdrawal rejected' end, w.amount::text || coalesce(' — ' || note, ''), w.company_id);
  insert into notifications (company_id, title, body, link) values (w.company_id, case when approve then 'Withdrawal paid' else 'Withdrawal rejected' end, w.amount::text || coalesce(' — ' || note, ''), '/app/wallet');
  return w;
end $$;

-- ---------------------------------------------------------------- policies that now require an active account
drop policy "judge reads own" on scores;
drop policy "judge writes own" on scores;
drop policy "judge edits draft" on scores;
create policy "judge reads own" on scores for select using ((judge_id = auth.uid() and is_active()) or is_admin());
create policy "judge writes own" on scores for insert with check (judge_id = auth.uid() and is_active()
  and exists (select 1 from event_judges j where j.event_id = scores.event_id and j.judge_id = auth.uid())
  and not (select results_released from events where id = scores.event_id));
create policy "judge edits draft" on scores for update using (judge_id = auth.uid() and is_active() and not submitted)
  with check (judge_id = auth.uid());

drop policy "public events" on events;
create policy "public events" on events for select using (event_is_public(events) or can_manage_event(id)
  or (is_active() and exists (select 1 from event_judges j where j.event_id = id and j.judge_id = auth.uid())));
drop policy "see panels" on event_judges;
create policy "see panels" on event_judges for select using ((judge_id = auth.uid() and is_active()) or can_manage_event(event_id));

-- Organisers see their colleagues (to put judges on panels); admins see everyone; everyone sees themselves.
drop policy "see self and colleagues" on profiles;
create policy "see self and colleagues" on profiles for select
  using (id = auth.uid() or is_admin() or (company_id is not null and company_id = my_company()));
drop policy "admin profiles" on profiles;
create policy "own profile name" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create or replace function guard_profile_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and (new.role <> old.role or new.status <> old.status or new.super <> old.super or new.company_id is distinct from old.company_id) then
    raise exception 'Only MyVoteHub admins can change roles or approval';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile_update();

-- Companies: pending organisers can still see their own (pending) company.
drop policy "public companies" on companies;
create policy "public companies" on companies for select using (status = 'active' or is_admin()
  or id = (select company_id from profiles where id = auth.uid()));

-- Activity written by the apps themselves.
create policy "write audit" on audit_log for insert with check (is_active() and user_id = auth.uid());
create policy "send notifications" on notifications for insert with check (is_active());
drop policy "admin settings" on settings;
create policy "admin settings" on settings for update using (is_super());

-- Admins approve events and change any company; organisers keep their own rules from 0001.
create policy "admin events" on events for update using (is_admin()) with check (is_admin());

grant execute on function cast_test_vote, request_free_vote_code, cast_free_vote, receipt, public_tallies, released_scores,
  company_by_code, super_admin_exists to anon, authenticated;
