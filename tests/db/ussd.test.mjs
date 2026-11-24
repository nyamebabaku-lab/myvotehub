// USSD engine + nominee dashboard tests (PGlite, all migrations).
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
await db.exec(`grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;`);
// Seed: active company, a live paid event (2 categories) and a live free poll.
await db.exec(`
insert into auth.users values ('00000000-0000-0000-0000-00000000000b', 'o@co.com');
insert into companies (id, name, status) values ('10000000-0000-0000-0000-000000000001', 'Co', 'active');
insert into profiles (id, role, company_id, name, email, status) values ('00000000-0000-0000-0000-00000000000b', 'organiser', '10000000-0000-0000-0000-000000000001', 'O', 'o@co.com', 'active');
insert into events (id, company_id, title, start_at, end_at, status, bundles, price_per_vote) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Starlight Music Awards', now()-interval '1 day', now()+interval '5 days','live','[{"votes":1,"price":1},{"votes":10,"price":9},{"votes":50,"price":40}]', 1);
insert into events (id, company_id, title, start_at, end_at, status, voting_mode, free_votes_per_voter) values
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Campus Poll', now()-interval '1 day', now()+interval '5 days','live','free',1);
insert into categories (id, event_id, name, code, sort) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Artiste of the Year','AOY',0),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Song of the Year','SOY',1),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','Best Lecturer','LEC',0);
insert into nominees (id, event_id, category_id, name, code) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Kwesi Blaze','AOY-01'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Adjoa Melody','AOY-02'),
 ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','Dr. Mensah','LEC-01');
`);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
let sid = 0;
async function dial(phone, inputs) {
  const s = `s${++sid}`;
  const screens = [];
  for (const i of ['', ...inputs]) {
    const r = (await db.query(`select * from ussd_step($1, $2, $3)`, [s, phone, i])).rows[0];
    screens.push(r);
    if (r.done) break;
  }
  return screens;
}
const last = (s) => s[s.length - 1];
const show = (s) => s.map((x) => `[${x.done ? 'END' : 'CON'}] ${x.message.replace(/\n/g, ' | ')}`).join('\n   ');

let s = await dial('233244123456', []);
ok(s[0].message.startsWith('Welcome to MyVoteHub') && !s[0].done, 'session opens on the main menu');
ok(s[0].message.length <= 182, `menu fits a USSD screen (${s[0].message.length} chars)`);

s = await dial('233244123456', ['1', 'aoy-01', '2', '1']);
console.log('   ' + show(s));
ok(last(s).done && /TEST MODE/.test(last(s).message) && /10 votes for Kwesi Blaze added/.test(last(s).message), 'code → 10-vote bundle → confirm adds votes');
const v = (await db.query(`select qty, channel, voter, is_test from votes`)).rows;
ok(v.length === 1 && v[0].qty === 10 && v[0].channel === 'ussd' && v[0].voter === '0244123456' && v[0].is_test, 'vote stored as USSD from 0244123456 (TEST)');
const p = (await db.query(`select amount, commission, net, method from payments`)).rows[0];
ok(+p.amount === 9 && +p.net === 8.1, `payment GHS ${p.amount}, commission split (${p.commission})`);
ok((await db.query(`select message from sms_log`)).rows[0]?.message.includes('Ref MVH'), 'SMS receipt logged (simulated)');

s = await dial('0201112233', ['2', '1', '1', '1', '4', '25', '1']);
console.log('   ' + show(s));
ok(/25 votes for Kwesi Blaze/.test(last(s).message), 'browse: event → category → nominee → other amount 25 → confirm');

s = await dial('0201112233', ['2', '2', '1', '1']);
ok(/free vote for Dr. Mensah is counted/.test(last(s).message), 'free poll: single category skipped, free vote counted');
s = await dial('0201112233', ['1', 'LEC-01', '1']);
ok(/no free votes left/.test(last(s).message), 'second free vote in same category refused');

s = await dial('0244000000', ['1', 'AOY-02', '1', '1']);
ok(/declined/i.test(last(s).message) && (await db.query(`select count(*)::int n from votes where nominee_id='40000000-0000-0000-0000-000000000002'`)).rows[0].n === 0, 'declined (number ending 000) adds no votes');

s = await dial('0244123456', ['3', 'AOY-01']);
ok(/Kwesi Blaze \(AOY-01\) has 35 votes/.test(last(s).message), `check votes: "${last(s).message}"`);
await db.exec(`update events set show_counts=false, show_leaderboard=false where id='20000000-0000-0000-0000-000000000001'`);
s = await dial('0244123456', ['3', 'AOY-01']);
ok(/hidden/.test(last(s).message), 'check votes respects hidden counts');

s = await dial('0244123456', ['1', 'ZZZ-99']);
ok(!last(s).done && /No live nominee/.test(last(s).message), 'unknown code asks again');
s = await dial('0244123456', ['1', 'AOY-01', '0', '0']);
ok(last(s).message.startsWith('Welcome') || last(s).done, 'back navigation returns to the menu');
s = await dial('0244123456', ['7']);
ok(/Invalid choice/.test(last(s).message), 'invalid choice handled');

await db.exec(`update events set status='closed' where id='20000000-0000-0000-0000-000000000001'`);
s = await dial('0244123456', ['1', 'AOY-01']);
ok(/No live nominee/.test(last(s).message), 'closed events are not votable');
await db.exec(`update events set status='live', show_counts=true, show_leaderboard=true where id='20000000-0000-0000-0000-000000000001'`);

// Access control
await db.exec(`set role anon`);
try { await db.query(`select * from ussd_step('x','0244','')`); ok(false, 'anon cannot call the engine'); } catch { ok(true, 'anon cannot call the engine directly'); }
try { await db.query(`select * from ussd_simulate('x','0244','')`); ok(false, 'anon simulator'); } catch (e) { ok(/admins/.test(e.message), 'simulator is admin-only'); }
await db.exec(`reset role`);

// Nominee dashboard
await db.exec(`select set_config('request.uid', '00000000-0000-0000-0000-00000000000b', false); set role authenticated;`);
const tok = (await db.query(`select nominee_link('40000000-0000-0000-0000-000000000001') t`)).rows[0].t;
await db.exec(`reset role; select set_config('request.uid', '', false);`);
ok(/^[0-9a-f]{32}$/.test(tok), 'organiser gets a private link token');
await db.exec(`set role anon`);
const d = (await db.query(`select nominee_dashboard($1) d`, [tok])).rows[0].d;
ok(d.total === 35 && d.today === 35 && d.rank === 1 && d.competitors === 2, `dashboard: total ${d.total}, today ${d.today}, rank ${d.rank}/${d.competitors}`);
ok(!['web', 'ussd', 'channels', 'byChannel'].some((k) => k in d) && !JSON.stringify(d.daily).match(/web|ussd/i), 'dashboard has no web/USSD split');
ok(d.daily.length === 14 && d.daily[13].votes === 35, '14-day chart ends with today');
ok((await db.query(`select nominee_dashboard('nope') d`)).rows[0].d === null, 'wrong token shows nothing');
ok((await db.query(`select * from nominee_links`)).rows.length === 0, 'anon cannot list link tokens');
await db.exec(`reset role`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
