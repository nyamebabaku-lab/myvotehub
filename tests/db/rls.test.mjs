// Row-level security + RPC tests for all migrations, run as real anon/authenticated roles in PGlite.
// Run: node tests/db/rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
const M = new URL('../../supabase/migrations/', import.meta.url).pathname;
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text, encrypted_password text, updated_at timestamptz);
create schema extensions; create function extensions.gen_salt(text) returns text language sql as $$ select '$2a$10$salt' $$;
create function extensions.crypt(text, text) returns text language sql as $$ select $2 || md5($1) $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.email', true), '') $$;
create publication supabase_realtime; create role anon; create role authenticated;`);
for (const f of readdirSync(M).filter((x) => x.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(M + f, 'utf8').replace('create extension if not exists pgcrypto;', '')); }
  catch (e) { console.log('MIGRATION ERROR', f, e.message); process.exit(1); }
}
await db.exec(`grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;`);
const U = { S: '00000000-0000-0000-0000-00000000000a', O: '00000000-0000-0000-0000-00000000000b', J: '00000000-0000-0000-0000-00000000000c', X: '00000000-0000-0000-0000-00000000000d', A: '00000000-0000-0000-0000-00000000000e' };
const EM = { S: 'nyamebabaku@gmail.com', O: 'o@co.com', J: 'j@co.com', X: 'x@x.com', A: 'a@hq.com' };
for (const k in U) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [U[k], EM[k]]);
const EV = '20000000-0000-0000-0000-000000000001', CAT = '30000000-0000-0000-0000-000000000001', NOM = '40000000-0000-0000-0000-000000000001';
let pass = 0, fail = 0;
async function as(who, sql) {
  await db.exec(`reset role; select set_config('request.uid', '${who ? U[who] : ''}', false), set_config('request.email', '${who ? EM[who] : ''}', false); set role ${who ? 'authenticated' : 'anon'};`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const throws = async (who, sql, m) => { try { await as(who, sql); ok(false, m + ' (no error)'); } catch (e) { ok(true, `${m} → ${e.message.slice(0, 70)}`); } };
const rows = async (who, sql) => (await as(who, sql)).rows;

await throws('X', `select claim_super_admin('X')`, 'other email cannot claim Super Admin');
await as('S', `select claim_super_admin('Super')`); ok(true, 'reserved email claims Super Admin');
await throws('A', `select claim_super_admin('A')`, 'second claim blocked');
await as('O', `select register_company('{"name":"Starlight","city":"Accra"}'::jsonb, 'Kwame')`);
ok((await rows('O', `select status from my_profile()`))[0].status === 'pending', 'new organiser is pending');
ok((await rows('O', `select status from companies`)).length === 1, 'pending organiser sees own pending company');
await throws('O', `insert into events (company_id, title, start_at, end_at) select id, 'E', now(), now()+interval '1 day' from companies`, 'pending organiser cannot create events');
await throws('O', `update profiles set status='active' where id=auth.uid()`, 'organiser cannot approve self');
await throws('O', `select set_account_status('${U.O}', 'active')`, 'organiser cannot call admin RPC');
await as('S', `select set_account_status('${U.O}', 'active')`);
ok((await rows('S', `select status from companies`))[0].status === 'active', 'approving owner activates company');
const code = (await rows('S', `select join_code from companies`))[0].join_code;
ok(/^[A-Z0-9]{6}$/.test(code), `join code ${code}`);
await as('O', `insert into events (id, company_id, title, start_at, end_at, criteria, judge_weight, public_weight, bundles) select '${EV}', id, 'E', now()-interval '1 hour', now()+interval '1 day', '[{"id":"c1","name":"x","max":10}]', 40, 60, '[{"votes":10,"price":9}]' from companies`);
await as('O', `insert into categories (id, event_id, name, code) values ('${CAT}','${EV}','C','CCC')`);
await as('O', `insert into nominees (id, event_id, category_id, name, code) values ('${NOM}','${EV}','${CAT}','N','CCC-01')`);
ok(true, 'approved organiser builds event');
await throws('O', `update events set status='approved'`, 'organiser cannot approve own event');
await throws('O', `update companies set commission_pct = 1`, 'organiser cannot change commission');
await as('O', `update events set status='pending'`);
ok((await rows(null, `select title from events`)).length === 0, 'anon cannot see pending event');
await as('S', `update events set status='approved'`);
await as('O', `update events set status='live'`);
ok((await rows(null, `select title from events`)).length === 1, 'anon sees live event');
await as('J', `select join_company('${code}', 'judge', 'Judge J')`);
ok((await rows('O', `select name, status from profiles where role='judge'`))[0]?.status === 'pending', 'organiser sees pending judge');
await throws('J', `insert into scores (event_id, judge_id, nominee_id, total) values ('${EV}', auth.uid(), '${NOM}', 5)`, 'pending judge cannot score');
await as('S', `select set_account_status('${U.J}', 'active')`);
await as('O', `insert into event_judges values ('${EV}', '${U.J}')`);
await as('J', `insert into scores (event_id, judge_id, nominee_id, total, submitted) values ('${EV}', auth.uid(), '${NOM}', 8, true)`);
ok((await rows('J', `select * from scores`)).length === 1, 'judge sees own score');
await as('J', `update scores set total = 10`);
ok(+(await rows('J', `select total from scores`))[0].total === 8, 'submitted score is locked');
ok((await rows('O', `select * from scores`)).length === 0, 'organiser cannot read raw scores');
ok((await rows('O', `select * from released_scores()`)).length === 0, 'scores sealed before release');
await throws(null, `insert into votes (event_id, category_id, nominee_id, qty, voter) values ('${EV}','${CAT}','${NOM}', 1000, 'x')`, 'anon cannot insert votes directly');
const v = (await rows(null, `select * from cast_test_vote('${NOM}', 10, 'mtn', '0244123456', 'dev1')`))[0];
ok(v.status === 'success' && +v.amount === 9, `test paid vote: ${v.votes} votes GH₵${v.amount}`);
const d = (await rows(null, `select * from cast_test_vote('${NOM}', 10, 'mtn', '0244123000')`))[0];
ok(d.status === 'failed', 'number ending 000 declined');
ok(+(await rows(null, `select votes from public_tallies()`))[0].votes === 10, 'public tally shows 10');
ok((await rows(null, `select * from payments`)).length === 0, 'anon cannot read payments');
ok((await rows(null, `select * from receipt('${v.ref}')`))[0].voter.includes('****'), 'receipt masks the voter');
const w = (await rows('O', `select * from wallet((select id from companies))`))[0];
ok(+w.net === 8.1 && +w.available === 8.1, `wallet net ${w.net}`);
await db.exec(`update settings set min_withdrawal = 5`);
await throws('O', `select request_withdrawal(50, '{}')`, 'withdrawal cannot overdraw');
await as('O', `select request_withdrawal(8, '{}')`);
await throws('O', `select request_withdrawal(5, '{}')`, 'pending withdrawal holds the balance');
await as('O', `update events set voting_mode='free', free_votes_per_voter=1`);
const otp = (await rows(null, `select request_free_vote_code('0201112233') c`))[0].c;
ok(/^\d{6}$/.test(otp), 'test mode returns the code');
await throws(null, `select cast_free_vote('0201112233', '000000', '${NOM}')`, 'wrong code rejected');
ok((await rows(null, `select cast_free_vote('0201112233', '${otp}', '${NOM}') r`))[0].r === 0, 'free vote counted');
await throws(null, `select cast_free_vote('0201112233', '${otp}', '${NOM}')`, 'second free vote blocked');
await as('O', `update events set results_released = true`);
ok((await rows(null, `select * from released_scores()`)).length === 1, 'scores visible after release');
await as('A', `select request_admin('Ama')`);
await throws('A', `select set_account_status('${U.O}', 'suspended')`, 'pending admin cannot act');
await as('S', `select set_account_status('${U.A}', 'active')`);
await throws('A', `select set_account_status('${U.S}', 'suspended')`, 'normal admin cannot suspend Super Admin');
await throws('A', `select set_test_mode(false)`, 'normal admin cannot switch test mode');
await throws('A', `select set_ussd_code('*713*44#')`, 'normal admin cannot set the USSD code');
await as('S', `select set_ussd_code('*713*44#')`);
ok((await rows(null, `select ussd_code from settings`))[0].ussd_code === '*713*44#', 'Super Admin sets the USSD code');
ok((await rows('A', `select * from sms_log`)).length >= 0 && (await rows('O', `select * from sms_log`)).length === 0, 'organisers cannot read the SMS log');
await as('A', `select set_account_status('${U.O}', 'suspended', 'test')`);
ok((await rows('O', `select * from payments`)).length === 0, 'suspended organiser sees no payments');
await throws('O', `insert into categories (event_id, name, code) values ('${EV}','D','DDD')`, 'suspended organiser cannot edit');
await throws('O', `select nominee_link('${NOM}')`, 'suspended organiser cannot get nominee links');

// Password help
await as(null, `select request_password_help('o@co.com')`);
ok((await rows('S', `select * from password_help`)).length === 1 && (await rows('O', `select * from password_help`)).length === 0, 'anon can ask for password help; only admins read the requests');
await as(null, `select request_password_help('nobody@x.com')`);
ok((await rows('S', `select * from password_help`)).length === 1, 'unknown emails are silently ignored');
await throws('O', `select admin_reset_password('${U.A}', 'temppass123')`, 'organisers cannot reset passwords');
await throws('A', `select admin_reset_password('${U.S}', 'temppass123')`, 'normal admin cannot reset a Super Admin');
await throws('S', `select admin_reset_password('${U.O}', 'short')`, 'temporary password needs 8+ characters');
await as('S', `select admin_reset_password('${U.O}', 'temppass123')`);
const pw = (await db.query(`select encrypted_password from auth.users where id='${U.O}'`)).rows[0].encrypted_password;
ok(pw?.startsWith('$2a$') && (await rows('S', `select must_change_password m from profiles where id='${U.O}'`))[0].m === true && (await rows('S', `select handled from password_help`))[0].handled, 'admin reset stores a bcrypt hash, forces a change, closes the request');
await as('O', `select password_changed()`);
ok((await rows('S', `select must_change_password m from profiles where id='${U.O}'`))[0].m === false, 'user clears the flag after changing password');
await throws('S', `select delete_account('${U.S}')`, 'cannot delete yourself');
await as('S', `select delete_account('${U.J}')`);
ok((await db.query(`select 1 from profiles where id='${U.J}' union all select 1 from auth.users where id='${U.J}'`)).rows.length === 0, 'deleted account is gone');
await as('S', `select set_test_mode(false)`);
ok(+(await rows('S', `select * from wallet((select id from companies))`))[0].gross === 0, 'test money ignored when test mode off');
await throws(null, `select * from cast_test_vote('${NOM}', 1, 'mtn', '0244123456')`, 'test votes blocked when test mode off');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
