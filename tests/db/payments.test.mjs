// Real-payment database rules (PGlite, all migrations): pending → confirmed, idempotency, amounts, USSD queue, payouts.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
const M = new URL('../../supabase/migrations/', import.meta.url).pathname;
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text, encrypted_password text, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.email', true), '') $$;
create publication supabase_realtime; create role anon; create role authenticated; create role service_role;`);
for (const f of readdirSync(M).filter((x) => x.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(M + f, 'utf8').replace('create extension if not exists pgcrypto;', '')); }
  catch (e) { console.log('MIGRATION ERROR', f, e.message); process.exit(1); }
}
await db.exec(`grant usage on schema public, auth to anon, authenticated, service_role; grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;`);
const CO = '10000000-0000-0000-0000-000000000001', ADM = '00000000-0000-0000-0000-0000000000aa', ORG = '00000000-0000-0000-0000-00000000000b';
await db.exec(`
insert into auth.users values ('${ADM}', 'a@x.com'), ('${ORG}', 'o@co.com');
insert into companies (id, name, status, commission_pct) values ('${CO}', 'Co', 'active', 10);
insert into profiles (id, role, name, email, status, super) values ('${ADM}', 'admin', 'A', 'a@x.com', 'active', true);
insert into profiles (id, role, company_id, name, email, status) values ('${ORG}', 'organiser', '${CO}', 'O', 'o@co.com', 'active');
insert into events (id, company_id, title, start_at, end_at, status, bundles, price_per_vote) values
 ('20000000-0000-0000-0000-000000000001','${CO}','Starlight Music Awards', now()-interval '1 day', now()+interval '5 days','live','[{"votes":1,"price":1},{"votes":10,"price":9},{"votes":100,"price":80}]', 1);
insert into categories (id, event_id, name, code, sort) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Artiste of the Year','AOY',0);
insert into nominees (id, event_id, category_id, name, code) values ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Kwesi Blaze','AOY-01');
update settings set test_mode = false, min_withdrawal = 10 where id;
`);
const N = '40000000-0000-0000-0000-000000000001';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const one = async (q, p) => (await db.query(q, p)).rows[0];
const as = async (role, uid, q, p) => {
  await db.exec(`select set_config('request.uid', '${uid || ''}', false); set role ${role};`);
  try { return await db.query(q, p); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
};
const denied = async (role, q) => { try { await as(role, null, q); return false; } catch (e) { return /permission denied/.test(e.message); } };
const votes = async () => Number((await one(`select coalesce(sum(qty),0) n from votes where nominee_id = '${N}'`)).n);

// 1. Only the server can create or confirm payments
ok(await denied('anon', `select * from start_payment('${N}', 100, 'mtn', '0244123456')`), 'voters cannot create payments directly');
ok(await denied('anon', `select complete_payment('X', 'p', 80)`), 'voters cannot mark a payment paid');
ok(await denied('authenticated', `select * from begin_payout(gen_random_uuid(), '${ADM}')`), 'signed-in users cannot start payouts directly');

// 2. Pending payment at the bundle price, no votes yet
const p = await one(`select * from start_payment('${N}', 100, 'mtn', '0244123456', 'dev1')`);
ok(Number(p.amount) === 80 && /^MVH\d{6}[A-F0-9]{6}$/.test(p.ref), `pending payment ${p.ref} for GH₵80 (bundle price)`);
ok((await votes()) === 0, 'no votes before the money is confirmed');
ok((await as('anon', null, `select status from payment_status($1)`, [p.ref])).rows[0].status === 'pending', 'voter can see the status');

// 3. Underpayment is refused, then confirmation counts votes once
ok((await one(`select complete_payment($1, 'PS1', 50) r`, [p.ref])).r === 'mismatch', 'paying less than due does not count');
ok((await votes()) === 0, 'still no votes after underpayment');
ok((await one(`select complete_payment($1, 'PS1', 80) r`, [p.ref])).r === 'success', 'confirmed payment succeeds');
ok((await one(`select complete_payment($1, 'PS1', 80) r`, [p.ref])).r === 'already', 'second confirmation (webhook + check) is ignored');
ok((await votes()) === 100, '100 votes counted exactly once');
const paid = await one(`select commission, net, channel from payments where ref = $1`, [p.ref]);
ok(Number(paid.commission) === 8 && Number(paid.net) === 72, 'commission 10% → GH₵8, organiser GH₵72');

// 4. Failed payment
const p2 = await one(`select * from start_payment('${N}', 10, 'telecel', '0201234567')`);
await db.query(`select fail_payment($1, 'Declined by customer')`, [p2.ref]);
ok((await one(`select status, note from payments where ref = $1`, [p2.ref])).note === 'Declined by customer', 'declined payment is marked failed with the reason');
ok((await votes()) === 100, 'declined payment adds no votes');

// 5. Closed event refuses new payments
await db.exec(`update events set end_at = now() - interval '1 minute' where id = '20000000-0000-0000-0000-000000000001'`);
let closed = false; try { await db.query(`select * from start_payment('${N}', 10, 'mtn', '0244123456')`); } catch (e) { closed = /closed/i.test(e.message); }
ok(closed, 'no payment can start after voting closes');
await db.exec(`update events set end_at = now() + interval '5 days' where id = '20000000-0000-0000-0000-000000000001'`);

// 6. USSD: menu queues a payment, gateway claims it once, confirmation counts USSD votes + SMS receipt
const s = 'u1';
for (const i of ['', '1', 'AOY-01', '2', '1']) await db.query(`select * from ussd_step($1, '233244555666', $2)`, [s, i]);
const q = await one(`select ref, provider, channel, amount from payments where voter = '0244555666'`);
ok(q && q.provider === null && q.channel === 'ussd', `USSD vote queues a MoMo charge (${q?.ref}, GH₵${q?.amount})`);
const claimed = (await db.query(`select * from claim_ussd_charges('233244555666')`)).rows;
ok(claimed.length === 1 && claimed[0].provider === 'paystack', 'gateway claims the queued charge once');
ok((await db.query(`select * from claim_ussd_charges('233244555666')`)).rows.length === 0, 'it is not sent twice');
await db.query(`select complete_payment($1, 'PS2', $2)`, [q.ref, q.amount]);
ok((await one(`select channel from votes where payment_id = (select id from payments where ref = $1)`, [q.ref])).channel === 'ussd', 'USSD payment counts as USSD votes');
ok(/received/.test((await one(`select message from sms_log where phone = '0244555666' order by created_at desc limit 1`)).message), 'SMS receipt queued for the caller');

// 7. Payouts
await db.exec(`select set_config('request.uid', '${ORG}', false);`);
const w = await one(`select * from request_withdrawal(60, '{"type":"momo","network":"mtn","number":"0244100200","name":"Co"}')`);
await db.exec(`select set_config('request.uid', '', false);`);
let blocked = false; try { await as('authenticated', ADM, `select * from decide_withdrawal($1, true)`, [w.id]); } catch (e) { blocked = /Pay out now/.test(e.message); }
ok(blocked, 'a live withdrawal cannot be "approved" without sending the money');
let notAdmin = false; try { await db.query(`select * from begin_payout($1, $2)`, [w.id, ORG]); } catch (e) { notAdmin = /admins/.test(e.message); }
ok(notAdmin, 'only an admin can start a payout');
const b = await one(`select * from begin_payout($1, $2)`, [w.id, ADM]);
ok(b.provider === 'paystack' && Number(b.amount) === 60, 'payout starts: processing via Paystack');
ok((await one(`select finish_payout($1, false, null, 'Recipient number invalid') r`, [b.ref])).r === 'failed', 'failed payout recorded');
const bal = async () => {
  await db.exec(`select set_config('request.uid', '${ORG}', false);`);
  const r = await one(`select available from wallet('${CO}')`); await db.exec(`select set_config('request.uid', '', false);`); return Number(r.available);
};
const total = 72 + Number(q.amount) * 0.9;
ok(Math.abs((await bal()) - total) < 0.01, `failed payout returns the money to the balance (GH₵${(await bal()).toFixed(2)})`);
const b2 = await one(`select * from begin_payout($1, $2)`, [w.id, ADM]);
ok(b2.ref !== b.ref, 'retry uses a new payout reference');
ok((await one(`select finish_payout($1, true, 'TRF_1') r`, [b2.ref])).r === 'paid', 'retry paid');
ok((await one(`select finish_payout($1, true, 'TRF_1') r`, [b2.ref])).r === 'already', 'duplicate payout callback ignored');
ok(Math.abs((await bal()) - (total - 60)) < 0.01, 'balance reduced by the payout');
const w2 = (await as('authenticated', ORG, `select * from request_withdrawal(20, '{"type":"bank","bank":"GCB Bank","number":"1021","name":"Co"}')`)).rows[0];
const m = (await as('authenticated', ADM, `select * from mark_withdrawal_paid($1, 'GCB-778812')`, [w2.id])).rows[0];
ok(m.status === 'paid' && m.provider === 'manual', 'admin can record a manual bank payment with its reference');

// 8. Settings
let notSuper = false; try { await as('authenticated', ORG, `select set_payment_config('hubtel','hubtel',true)`); } catch (e) { notSuper = /Super Admin/.test(e.message); }
ok(notSuper, 'organisers cannot change payment providers');
await as('authenticated', ADM, `select set_payment_config('hubtel','paystack',false)`);
ok((await one(`select pay_provider, payout_provider, auto_payout from settings`)).pay_provider === 'hubtel', 'Super Admin switches the payment provider');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
