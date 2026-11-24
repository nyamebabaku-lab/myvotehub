-- Real payments (Paystack and Hubtel) and automatic payouts.
-- The browser never writes payments: the `pay` Edge Function (service role) calls the functions below,
-- and only marks a payment successful after the provider confirms it (webhook or status check).

-- ---------------------------------------------------------------- settings
alter table settings
  add column pay_provider text not null default 'paystack' check (pay_provider in ('paystack', 'hubtel')),
  add column payout_provider text not null default 'paystack' check (payout_provider in ('paystack', 'hubtel')),
  add column auto_payout boolean not null default true;

create or replace function set_payment_config(pay text, payout text, auto boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super() then raise exception 'Only a Super Admin can change payment settings'; end if;
  update settings set pay_provider = pay, payout_provider = payout, auto_payout = auto where id;
  perform audit('Payment settings changed', 'Payments: ' || pay || ' · Payouts: ' || payout || case when auto then ' (automatic)' else ' (manual)' end);
end $$;

-- ---------------------------------------------------------------- payments
alter table payments
  add column provider text,                         -- paystack | hubtel; null = queued (USSD) and not sent yet
  add column channel text not null default 'web',   -- web | ussd: copied onto the vote
  add column device text,
  add column note text;                             -- what the voter must do / why it failed
create index on payments (status, created_at) where status = 'pending';

alter table withdrawals add column provider text, add column raw jsonb;

-- Creates a pending payment at today's price. Service role only (the pay function).
create or replace function start_payment(nid uuid, qty int, method text, voter text, device text default null, chan text default 'web')
returns table (ref text, amount numeric, votes int, nominee text, event text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare e events; n nominees; c companies; amt numeric; r text;
begin
  if test_mode() then raise exception 'Test mode is on'; end if;
  select * into n from nominees where id = nid;
  select * into e from events where id = n.event_id;
  perform check_votable(e, n);
  if e.voting_mode <> 'paid' then raise exception 'This is a free vote'; end if;
  if qty < 1 or qty > 10000 then raise exception 'Choose between 1 and 10,000 votes'; end if;
  select * into c from companies where id = e.company_id;
  select coalesce((select (b->>'price')::numeric from jsonb_array_elements(e.bundles) b where (b->>'votes')::int = qty limit 1), qty * e.price_per_vote) into amt;
  amt := round(amt, 2);
  if amt < 1 then raise exception 'The minimum payment is GH₵1'; end if;
  r := 'MVH' || to_char(now(), 'YYMMDD') || upper(substr(md5(random()::text), 1, 6));
  insert into payments (ref, event_id, company_id, nominee_id, voter, method, amount, votes, commission_pct, commission, net, status, channel, device, provider, is_test)
  values (r, e.id, e.company_id, n.id, voter, method, amt, qty, c.commission_pct, 0, 0, 'pending', chan, device,
          case when chan = 'ussd' then null else (select pay_provider from settings) end, false);
  return query select r, amt, qty, n.name, e.title;
end $$;

-- Called when the provider confirms the money arrived. Safe to call twice (webhook + status check).
create or replace function complete_payment(r text, pref text, paid numeric, info jsonb default null, card_voter text default null)
returns text language plpgsql security definer set search_path = public as $$
declare p payments; e events; n nominees; com numeric; fl text; vars jsonb;
begin
  select * into p from payments where ref = r for update;
  if p.id is null then return 'unknown'; end if;
  if p.status = 'success' then return 'already'; end if;
  if paid + 0.009 < p.amount then
    update payments set raw = info, note = 'Paid ' || paid || ' but ' || p.amount || ' was due' where id = p.id;
    perform audit('Payment amount mismatch', r || ': paid ' || paid || ', due ' || p.amount, p.company_id, p.event_id);
    return 'mismatch';
  end if;
  com := round(p.amount * p.commission_pct / 100, 2);
  update payments set status = 'success', provider_ref = coalesce(pref, provider_ref), raw = info, completed_at = now(),
    commission = com, net = p.amount - com, note = null, voter = coalesce(card_voter, voter)
  where id = p.id;
  select * into n from nominees where id = p.nominee_id;
  select * into e from events where id = p.event_id;
  fl := burst_flag(p.device);
  insert into votes (event_id, category_id, nominee_id, qty, voter, channel, payment_id, round, device, flagged, is_test)
  values (p.event_id, n.category_id, n.id, p.votes, coalesce(card_voter, p.voter), p.channel, p.id, (e.rounds->>'current')::int, p.device, fl, false)
  on conflict (payment_id) do nothing;
  if p.channel = 'ussd' then
    vars := jsonb_build_object('name', ussd_cut(n.name, 30), 'code', n.code, 'event', ussd_cut(e.title, 30), 'qty', p.votes, 'amount', ussd_cedi(p.amount), 'ref', p.ref);
    insert into sms_log (phone, message, event_id) values (p.voter, ussd_t('sms_paid', vars), e.id);
  end if;
  return 'success';
end $$;

create or replace function fail_payment(r text, reason text, info jsonb default null) returns void
language sql security definer set search_path = public as $$
  update payments set status = 'failed', note = reason, raw = coalesce(info, raw), completed_at = now() where ref = r and status = 'pending';
$$;

-- Keeps the "what to do next" message (e.g. "enter the code sent by SMS") and provider ids on a pending payment.
create or replace function note_payment(r text, msg text, pref text default null, prov text default null) returns void
language sql security definer set search_path = public as $$
  update payments set note = msg, provider_ref = coalesce(pref, provider_ref), provider = coalesce(prov, provider) where ref = r and status = 'pending';
$$;

-- USSD payments are queued by the menu; the USSD gateway picks them up and sends the MoMo prompt.
create or replace function claim_ussd_charges(msisdn text) returns setof payments
language sql security definer set search_path = public as $$
  update payments set provider = (select pay_provider from settings)
  where voter = ussd_phone(msisdn) and channel = 'ussd' and status = 'pending' and provider is null and created_at > now() - interval '5 minutes'
  returning *;
$$;

-- Public status for the voter's screen (no personal data).
create or replace function payment_status(r text) returns table (ref text, status text, note text, votes int, amount numeric)
language sql stable security definer set search_path = public as $$
  select ref, status, note, votes, amount from payments where payments.ref = r;
$$;

-- ---------------------------------------------------------------- payouts
-- Admin starts a payout: pending (or failed, to retry) → processing. The pay function then sends the money.
create or replace function begin_payout(wid uuid, admin uuid) returns table (id uuid, ref text, amount numeric, destination jsonb, company text, provider text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare w withdrawals; prov text;
begin
  if not exists (select 1 from profiles where profiles.id = admin and role = 'admin' and status = 'active') then raise exception 'Only MyVoteHub admins can pay out'; end if;
  select * into w from withdrawals where withdrawals.id = wid for update;
  if w.id is null then raise exception 'Withdrawal not found'; end if;
  if w.status not in ('pending', 'failed') then raise exception 'This withdrawal is already %', w.status; end if;
  if w.is_test then raise exception 'Test withdrawals are approved without sending money'; end if;
  if w.status = 'failed' and w.amount + w.fee > (
       (select coalesce(sum(net), 0) from payments where company_id = w.company_id and status = 'success' and not is_test)
     - (select coalesce(sum(amount + fee), 0) from withdrawals where company_id = w.company_id and not is_test and status in ('paid', 'pending', 'processing'))) then
    raise exception 'Not enough balance left to retry this payout';
  end if;
  select payout_provider into prov from settings;
  -- A retry gets a new reference so the provider does not reject it as a duplicate.
  update withdrawals set status = 'processing', decided_by = admin, decided_at = now(), provider = prov,
    ref = case when w.status = 'failed' then 'WD' || to_char(now(), 'YYMMDD') || substr(md5(random()::text), 1, 6) else w.ref end
  where withdrawals.id = wid returning * into w;
  insert into audit_log (user_id, company_id, action, detail) values (admin, w.company_id, 'Payout started', w.amount::text || ' via ' || prov || ' — ' || w.ref);
  return query select w.id, w.ref, w.amount, w.destination, (select name from companies where companies.id = w.company_id), prov;
end $$;

-- The provider's answer: paid, or failed (the money returns to the organiser's available balance).
create or replace function finish_payout(r text, ok boolean, pref text default null, reason text default null, info jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare w withdrawals;
begin
  select * into w from withdrawals where ref = r for update;
  if w.id is null then return 'unknown'; end if;
  if w.status <> 'processing' then return 'already'; end if;
  update withdrawals set status = case when ok then 'paid' else 'failed' end, payout_ref = coalesce(pref, payout_ref),
    note = coalesce(reason, note), raw = coalesce(info, raw) where id = w.id;
  insert into audit_log (user_id, company_id, action, detail) values (w.decided_by, w.company_id, case when ok then 'Withdrawal paid' else 'Payout failed' end, w.amount::text || ' — ' || r || coalesce(' — ' || reason, ''));
  insert into notifications (company_id, title, body, link) values (w.company_id, case when ok then 'Withdrawal paid' else 'Payout failed — we will retry' end, w.amount::text || coalesce(' — ' || reason, ''), '/app/wallet');
  if not ok then insert into notifications (to_role, title, body, link) values ('admin', 'Payout failed', (select name from companies where id = w.company_id) || ' · ' || w.amount::text || coalesce(' — ' || reason, ''), '/app/withdrawals'); end if;
  return case when ok then 'paid' else 'failed' end;
end $$;

-- For payouts sent outside the app (e.g. a bank transfer): the admin records the reference.
create or replace function mark_withdrawal_paid(wid uuid, pref text, note text default null) returns withdrawals
language plpgsql security definer set search_path = public as $$
declare w withdrawals;
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can do this'; end if;
  if coalesce(trim(pref), '') = '' then raise exception 'Enter the transfer reference'; end if;
  select * into w from withdrawals where id = wid for update;
  if w.status not in ('pending', 'processing', 'failed') then raise exception 'This withdrawal is already %', w.status; end if;
  update withdrawals set status = 'paid', payout_ref = trim(pref), note = coalesce(mark_withdrawal_paid.note, withdrawals.note),
    provider = 'manual', decided_by = auth.uid(), decided_at = now() where id = wid returning * into w;
  perform audit('Withdrawal paid', w.amount::text || ' — manual, ref ' || trim(pref), w.company_id);
  insert into notifications (company_id, title, body, link) values (w.company_id, 'Withdrawal paid', w.amount::text || ' — ref ' || trim(pref), '/app/wallet');
  return w;
end $$;

-- Live withdrawals are approved by paying them out (pay function) or by recording a manual payment.
create or replace function decide_withdrawal(wid uuid, approve boolean, note text default null) returns withdrawals
language plpgsql security definer set search_path = public as $$
declare w withdrawals;
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can do this'; end if;
  select * into w from withdrawals where id = wid for update;
  if w.status not in ('pending', 'failed') then raise exception 'Already decided'; end if;
  if approve and not w.is_test then raise exception 'Use "Pay out now" or "Mark as paid"'; end if;
  update withdrawals set status = case when approve then 'paid' else 'rejected' end, note = decide_withdrawal.note,
    decided_by = auth.uid(), decided_at = now(),
    payout_ref = case when approve then 'TEST' || (10000000 + floor(random() * 90000000))::int end
  where id = wid returning * into w;
  perform audit(case when approve then 'Withdrawal paid' else 'Withdrawal rejected' end, w.amount::text || coalesce(' — ' || note, ''), w.company_id);
  insert into notifications (company_id, title, body, link) values (w.company_id, case when approve then 'Withdrawal paid' else 'Withdrawal rejected' end, w.amount::text || coalesce(' — ' || note, ''), '/app/wallet');
  return w;
end $$;

-- ---------------------------------------------------------------- USSD: real MoMo prompt when test mode is off
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
    'pay_prompt', 'Approve the MoMo prompt on your phone to pay {amount} for {qty} votes for {name}.',
    'done_free', 'Thank you! Your free vote for {name} is counted.',
    'votes_count', '{name} ({code}) has {votes} votes.',
    'counts_hidden', 'Vote counts for {event} are hidden until the results are announced.',
    'sms_paid', 'MyVoteHub: {qty} votes for {name} ({code}) received. {amount}. Ref {ref}',
    'sms_free', 'MyVoteHub: your free vote for {name} ({code}) in {event} is counted. Thank you!',
    'goodbye', 'Thank you for using MyVoteHub.'
  );
$$;

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
    -- Queued: the USSD gateway sends the MoMo prompt as soon as this screen is shown; votes count once it is approved.
    select * into r from start_payment(nid, qty, 'momo', phone, 'ussd:' || phone, 'ussd');
    vars := vars || jsonb_build_object('ref', r.ref, 'amount', ussd_cedi(r.amount));
    return ussd_t('pay_prompt', vars) || E'\nRef ' || r.ref;
  end if;
  select * into r from cast_test_vote(nid, qty, 'momo', phone, 'ussd:' || phone);
  if r.status <> 'success' then return 'Payment declined. No money was taken. Please try again.'; end if;
  update votes set channel = 'ussd' where payment_id = (select id from payments where ref = r.ref);
  vars := vars || jsonb_build_object('ref', r.ref, 'amount', ussd_cedi(r.amount) || ' TEST - no money charged');
  insert into sms_log (phone, message, event_id) values (phone, ussd_t('sms_paid', vars), e.id);
  return 'TEST MODE - no money charged.' || E'\n' || ussd_t('done_paid', vars) || E'\nRef ' || r.ref;
end $$;

-- ---------------------------------------------------------------- permissions: server-only functions
revoke execute on function start_payment(uuid, int, text, text, text, text) from public, anon, authenticated;
revoke execute on function complete_payment(text, text, numeric, jsonb, text) from public, anon, authenticated;
revoke execute on function fail_payment(text, text, jsonb) from public, anon, authenticated;
revoke execute on function note_payment(text, text, text, text) from public, anon, authenticated;
revoke execute on function claim_ussd_charges(text) from public, anon, authenticated;
revoke execute on function begin_payout(uuid, uuid) from public, anon, authenticated;
revoke execute on function finish_payout(text, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function start_payment(uuid, int, text, text, text, text), complete_payment(text, text, numeric, jsonb, text),
  fail_payment(text, text, jsonb), note_payment(text, text, text, text), claim_ussd_charges(text),
  begin_payout(uuid, uuid), finish_payout(text, boolean, text, text, jsonb) to service_role;
