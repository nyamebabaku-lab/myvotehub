-- MyVoteHub Phase 2 schema: tables, row-level security and the server-side rules
-- that the browser prototype enforced in JavaScript (src/lib/*).
-- Money and votes are only ever written by security-definer functions or Edge Functions
-- (Hubtel callbacks), never directly by the browser.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- settings
create table settings (
  id boolean primary key default true check (id),
  platform_name text not null default 'MyVoteHub',
  currency text not null default 'GH₵',
  default_commission numeric(5,2) not null default 10,
  min_withdrawal numeric(12,2) not null default 50,
  require_event_approval boolean not null default true,
  max_votes_per_minute int not null default 20,
  support_email text default 'support@myvotehub.app',
  support_phone text
);
insert into settings default values;

-- ---------------------------------------------------------------- companies & people
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  email text,
  phone text,
  city text,
  logo_url text,
  brand_color text default '#2556eb',
  kyc text not null default 'submitted' check (kyc in ('submitted', 'verified', 'rejected')),
  kyc_docs jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  commission_pct numeric(5,2) not null default 10 check (commission_pct between 0 and 50),
  payout jsonb not null default '{}', -- {type: momo|bank, network, bank, number, name}
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin', 'organiser', 'judge')),
  company_id uuid references companies on delete set null,
  name text not null,
  title text,
  email text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;
create or replace function my_company() returns uuid language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid() and role = 'organiser' and status = 'active';
$$;

-- ---------------------------------------------------------------- events
create table events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  title text not null,
  type text not null default 'awards' check (type in ('awards', 'pageant', 'reality', 'poll')),
  tagline text, description text, venue text,
  cover text default 'blue', image_url text,
  start_at timestamptz not null, end_at timestamptz not null check (end_at > start_at),
  status text not null default 'draft' check (status in ('draft', 'pending', 'rejected', 'approved', 'live', 'closed')),
  review_note text, submitted_at timestamptz, reviewed_at timestamptz,
  voting_mode text not null default 'paid' check (voting_mode in ('paid', 'free')),
  price_per_vote numeric(10,2) not null default 1 check (price_per_vote > 0),
  bundles jsonb not null default '[]', -- [{votes, price}]
  free_votes_per_voter int not null default 1,
  free_period text not null default 'event' check (free_period in ('event', 'daily')),
  public_weight int not null default 100 check (public_weight between 0 and 100),
  judge_weight int not null default 0 check (judge_weight between 0 and 100),
  criteria jsonb not null default '[]', -- [{id, name, max}]
  show_leaderboard boolean not null default true,
  show_counts boolean not null default true,
  rounds jsonb, -- {current, carryOver, autoEvict, list:[{n,label,closedAt}]}
  results_released boolean not null default false,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  check (public_weight + judge_weight = 100)
);
create index on events (company_id);

create table event_judges (
  event_id uuid references events on delete cascade,
  judge_id uuid references profiles on delete cascade,
  primary key (event_id, judge_id)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  name text not null,
  code text not null,
  description text,
  sort int not null default 0,
  unique (event_id, code)
);

create table nominees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  category_id uuid not null references categories on delete cascade,
  name text not null,
  code text not null,
  bio text,
  photo_url text,
  status text not null default 'active' check (status in ('active', 'evicted')),
  evicted_round int,
  unique (event_id, code)
);
create index on nominees (category_id);

-- Public = visible on the voter site.
create or replace function event_is_public(e events) returns boolean language sql stable as $$
  select e.status in ('approved', 'live', 'closed');
$$;
create or replace function can_manage_event(eid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from events where id = eid and company_id = my_company());
$$;

-- ---------------------------------------------------------------- money & votes
create table payments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                 -- our reference, sent to Hubtel as clientReference
  provider_ref text,                        -- Hubtel transaction id
  event_id uuid not null references events,
  company_id uuid not null references companies,
  nominee_id uuid not null references nominees,
  voter text not null,
  method text not null,                     -- mtn | telecel | airteltigo | card
  amount numeric(12,2) not null check (amount > 0),
  votes int not null check (votes > 0),
  commission_pct numeric(5,2) not null,
  commission numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'refunded')),
  raw jsonb,                                -- last provider callback, for disputes
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on payments (company_id, status);
create index on payments (event_id);

create table votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  category_id uuid not null references categories on delete cascade,
  nominee_id uuid not null references nominees on delete cascade,
  qty int not null check (qty > 0),
  voter text not null,
  channel text not null default 'web' check (channel in ('web', 'ussd', 'sms')),
  payment_id uuid unique references payments, -- one vote record per payment: callbacks are idempotent
  round int,
  device text,
  flagged text,
  void boolean not null default false,
  void_reason text,
  created_at timestamptz not null default now()
);
create index on votes (event_id, category_id);
create index on votes (event_id, voter);

create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('WD' || to_char(now(), 'YYMMDD') || substr(md5(random()::text), 1, 6)),
  company_id uuid not null references companies,
  amount numeric(12,2) not null check (amount > 0),
  fee numeric(12,2) not null default 0,
  destination jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'rejected', 'failed')),
  note text,
  payout_ref text,
  requested_by uuid references profiles,
  requested_at timestamptz not null default now(),
  decided_by uuid references profiles,
  decided_at timestamptz
);

-- ---------------------------------------------------------------- judging & rounds
create table scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  judge_id uuid not null references profiles on delete cascade,
  nominee_id uuid not null references nominees on delete cascade,
  scores jsonb not null default '{}',
  total numeric(8,2) not null default 0,
  comment text,
  submitted boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (judge_id, nominee_id)
);

create table evictions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  nominee_id uuid not null references nominees on delete cascade,
  round int,
  mode text not null default 'manual' check (mode in ('manual', 'auto')),
  reason text,
  by uuid references profiles,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  company_id uuid,
  event_id uuid,
  action text not null,
  detail text
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  to_role text, user_id uuid, company_id uuid,
  title text not null, body text, link text,
  read boolean not null default false,
  at timestamptz not null default now()
);

create table otp_codes (
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  primary key (phone)
);

-- ---------------------------------------------------------------- row-level security
alter table settings enable row level security;
alter table companies enable row level security;
alter table profiles enable row level security;
alter table events enable row level security;
alter table event_judges enable row level security;
alter table categories enable row level security;
alter table nominees enable row level security;
alter table payments enable row level security;
alter table votes enable row level security;
alter table withdrawals enable row level security;
alter table scores enable row level security;
alter table evictions enable row level security;
alter table audit_log enable row level security;
alter table notifications enable row level security;
alter table otp_codes enable row level security; -- no policies: Edge Functions only

create policy "read settings" on settings for select using (true);
create policy "admin settings" on settings for update using (is_admin());

create policy "public companies" on companies for select using (status = 'active' or is_admin() or id = my_company());
create policy "admin companies" on companies for all using (is_admin()) with check (is_admin());
create policy "organiser edits own company" on companies for update using (id = my_company())
  with check (id = my_company());
-- Organisers must not change their own commission, status or KYC.
create or replace function guard_company_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and (new.commission_pct <> old.commission_pct or new.status <> old.status or new.kyc <> old.kyc) then
    raise exception 'Only MyVoteHub can change commission, status or verification';
  end if;
  return new;
end $$;
create trigger companies_guard before update on companies for each row execute function guard_company_update();

create policy "see self and colleagues" on profiles for select
  using (id = auth.uid() or is_admin() or (company_id is not null and company_id = my_company()));
create policy "admin profiles" on profiles for all using (is_admin()) with check (is_admin());

create policy "public events" on events for select using (event_is_public(events) or can_manage_event(id)
  or exists (select 1 from event_judges j where j.event_id = id and j.judge_id = auth.uid()));
create policy "organiser creates events" on events for insert with check (company_id = my_company() and status = 'draft');
create policy "organiser edits events" on events for update using (can_manage_event(id)) with check (can_manage_event(id));
create policy "delete events" on events for delete using (is_admin() or (company_id = my_company() and not exists (select 1 from votes v where v.event_id = id)));
-- Status changes go through review: organisers can't approve their own events or reopen rejected ones as live.
create or replace function guard_event_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then return new; end if;
  if new.status <> old.status and not (
       (old.status in ('draft', 'rejected') and new.status = 'pending')
    or (old.status in ('approved', 'closed') and new.status = 'live')
    or (old.status = 'live' and new.status = 'closed')
  ) then
    raise exception 'Event status % → % needs MyVoteHub approval', old.status, new.status;
  end if;
  if new.status = 'pending' and not (select require_event_approval from settings) then new.status := 'approved'; end if;
  return new;
end $$;
create trigger events_guard before update on events for each row execute function guard_event_update();

create policy "see panels" on event_judges for select using (judge_id = auth.uid() or can_manage_event(event_id));
create policy "manage panels" on event_judges for all using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy "read categories" on categories for select using (exists (select 1 from events e where e.id = event_id));
create policy "manage categories" on categories for all using (can_manage_event(event_id)) with check (can_manage_event(event_id));
create policy "read nominees" on nominees for select using (exists (select 1 from events e where e.id = event_id));
create policy "manage nominees" on nominees for all using (can_manage_event(event_id)) with check (can_manage_event(event_id));

-- Money: read-only from the browser. Writes come from Hubtel callbacks (service role).
create policy "see payments" on payments for select using (is_admin() or company_id = my_company());
create policy "see votes" on votes for select using (can_manage_event(event_id));
create policy "organiser voids votes" on votes for update using (can_manage_event(event_id)) with check (can_manage_event(event_id));
create policy "see withdrawals" on withdrawals for select using (is_admin() or company_id = my_company());

-- Judges: own scores only, editable until submitted. Organisers never read raw scores (see results()).
create policy "judge reads own" on scores for select using (judge_id = auth.uid() or is_admin());
create policy "judge writes own" on scores for insert with check (judge_id = auth.uid()
  and exists (select 1 from event_judges j where j.event_id = scores.event_id and j.judge_id = auth.uid()));
create policy "judge edits draft" on scores for update using (judge_id = auth.uid() and not submitted)
  with check (judge_id = auth.uid());

create policy "read evictions" on evictions for select using (exists (select 1 from events e where e.id = event_id));
create policy "manage evictions" on evictions for all using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy "read audit" on audit_log for select using (is_admin() or company_id = my_company());
create policy "read my notifications" on notifications for select using (
  user_id = auth.uid() or (to_role = 'admin' and is_admin()) or (company_id is not null and company_id = my_company()));
create policy "mark read" on notifications for update using (
  user_id = auth.uid() or (to_role = 'admin' and is_admin()) or (company_id is not null and company_id = my_company()));

-- ---------------------------------------------------------------- public tallies & results
-- Vote totals per nominee for the voter site; hidden when the organiser hides counts.
create or replace function event_tally(eid uuid, for_round int default null)
returns table (nominee_id uuid, category_id uuid, votes bigint)
language sql stable security definer set search_path = public as $$
  select v.nominee_id, v.category_id, sum(v.qty)::bigint
  from votes v join events e on e.id = v.event_id
  where v.event_id = eid and not v.void
    and (event_is_public(e) or can_manage_event(eid))
    and (e.show_counts or e.show_leaderboard or e.results_released or can_manage_event(eid))
    and (e.rounds is null or for_round is null
         or (coalesce((e.rounds->>'carryOver')::boolean, false) and coalesce(v.round, 1) <= for_round)
         or coalesce(v.round, 1) = for_round)
  group by v.nominee_id, v.category_id;
$$;

-- Judge averages per nominee (0–100). Returned only once results are released;
-- before that organisers get submission counts and nothing else.
create or replace function judge_scores(eid uuid)
returns table (nominee_id uuid, judge_avg numeric, judge_score numeric, judges_in int)
language sql stable security definer set search_path = public as $$
  with e as (select * from events where id = eid),
       mx as (select coalesce(sum((c->>'max')::numeric), 0) as m from e, jsonb_array_elements(e.criteria) c)
  select s.nominee_id, avg(s.total), case when (select m from mx) > 0 then avg(s.total) / (select m from mx) * 100 end, count(*)::int
  from scores s, e
  where s.event_id = eid and s.submitted and (e.results_released or is_admin())
  group by s.nominee_id;
$$;

create or replace function judge_progress(eid uuid)
returns table (judge_id uuid, name text, submitted int, drafts int)
language sql stable security definer set search_path = public as $$
  select j.judge_id, p.name,
    count(s.*) filter (where s.submitted)::int, count(s.*) filter (where not s.submitted)::int
  from event_judges j join profiles p on p.id = j.judge_id
  left join scores s on s.event_id = j.event_id and s.judge_id = j.judge_id
  where j.event_id = eid and can_manage_event(eid)
  group by j.judge_id, p.name;
$$;

-- ---------------------------------------------------------------- wallets & withdrawals
create or replace function wallet(cid uuid)
returns table (gross numeric, commission numeric, net numeric, paid_out numeric, pending numeric, available numeric, votes_sold bigint, tx_count bigint)
language sql stable security definer set search_path = public as $$
  with p as (select * from payments where company_id = cid and status = 'success'),
       w as (select * from withdrawals where company_id = cid)
  select coalesce(sum(p.amount), 0), coalesce(sum(p.commission), 0), coalesce(sum(p.net), 0),
    (select coalesce(sum(amount + fee), 0) from w where status = 'paid'),
    (select coalesce(sum(amount + fee), 0) from w where status in ('pending', 'processing')),
    greatest(0, coalesce(sum(p.net), 0)
      - (select coalesce(sum(amount + fee), 0) from w where status in ('paid', 'pending', 'processing'))),
    coalesce(sum(p.votes), 0), count(p.*)
  from p
  where is_admin() or cid = my_company();
$$;

-- Balance check and insert in one locked step, so two quick requests can't overdraw.
create or replace function request_withdrawal(amt numeric, dest jsonb) returns withdrawals
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_company(); bal numeric; minw numeric; rec withdrawals;
begin
  if cid is null then raise exception 'Organisers only'; end if;
  if (select status from companies where id = cid) <> 'active' then raise exception 'Company not verified'; end if;
  perform 1 from companies where id = cid for update;
  select available into bal from wallet(cid);
  select min_withdrawal into minw from settings;
  if amt < minw then raise exception 'Minimum withdrawal is %', minw; end if;
  if amt > bal then raise exception 'Only % is available', bal; end if;
  insert into withdrawals (company_id, amount, destination, requested_by) values (cid, amt, dest, auth.uid()) returning * into rec;
  insert into audit_log (user_id, company_id, action, detail) values (auth.uid(), cid, 'Withdrawal requested', amt::text);
  insert into notifications (to_role, title, body, link) values ('admin', 'Withdrawal awaiting approval', amt::text, '/app/withdrawals');
  return rec;
end $$;

-- ---------------------------------------------------------------- live updates
alter publication supabase_realtime add table votes, events, nominees, withdrawals, notifications;
