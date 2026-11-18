// USSD engine + nominee dashboard tests (PGlite, all migrations).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
const M = new URL('../../supabase/migrations/', import.meta.url).pathname;
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.email', true), '') $$;
create publication supabase_realtime; create role anon; create role authenticated;`);
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


const O = '00000000-0000-0000-0000-00000000000b';
async function asOrg(sql) { await db.exec(`select set_config('request.uid', '${O}', false); set role authenticated;`); try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); } }

// Defaults
let s = await dial('0244123456', []);
ok(/1\. Vote with nominee code\n2\. Browse events\n3\. Check votes\n0\. Exit/.test(s[0].message), 'default main menu');

// Admin wording + options order/off
await db.exec(`update settings set ussd_config = '{"texts":{"welcome":"Akwaaba to MyVoteHub!","opt_browse":"See all events","done_paid":"Medaase! {qty} votes for {name}."},"options":[{"key":"browse","on":true},{"key":"code","on":true},{"key":"check","on":false}]}'`);
s = await dial('0244123456', []);
ok(s[0].message === 'Akwaaba to MyVoteHub!\n1. See all events\n2. Vote with nominee code\n0. Exit', 'custom welcome, reordered options, "Check votes" switched off');
s = await dial('0244123456', ['2', 'AOY-01', '2', '1']);
ok(/Medaase! 10 votes for Kwesi Blaze\./.test(s[s.length - 1].message), 'custom thank-you text with placeholders; option 2 is now "vote by code"');
s = await dial('0244123456', ['3']);
ok(/Invalid choice/.test(s[s.length - 1].message), 'switched-off option is not reachable');

// Organiser: bundles subset, no "Other amount", greeting
await asOrg(`update events set ussd_bundles = '[{"votes":10,"price":9}]', ussd_other_amount = false, ussd_greeting = 'Vote for your Artiste of the Year!' where id = '20000000-0000-0000-0000-000000000001'`);
s = await dial('0244123456', ['2', 'AOY-02']);
const vs = s[s.length - 1].message;
ok(vs.startsWith('Vote for your Artiste of the Year!\n') && /1\. 10 votes GHS 9\.00\n0\. Back$/.test(vs), `organiser greeting + only chosen bundle, no Other amount: "${vs.replace(/\n/g, ' | ')}"`);

// Organiser hides the event from USSD; admin pins / hides
await db.exec(`update settings set ussd_config = '{}'`);
await asOrg(`update events set ussd_enabled = false where id = '20000000-0000-0000-0000-000000000002'`);
s = await dial('0244123456', ['2']);
ok(!/Campus Poll/.test(s[1].message), 'organiser took the poll off USSD');
s = await dial('0244123456', ['1', 'LEC-01']);
ok(/No live nominee/.test(s[2].message), 'its nominee codes stop working on USSD');
await asOrg(`update events set ussd_enabled = true where id = '20000000-0000-0000-0000-000000000002'`);
s = await dial('0244123456', ['2']);
ok(/1\. Starlight Music Awards\n2\. Campus Poll/.test(s[1].message), 'default order: closing soonest first');
await db.exec(`update events set ussd_featured = 1 where id = '20000000-0000-0000-0000-000000000002'`);
s = await dial('0244123456', ['2']);
ok(/1\. Campus Poll\n2\. Starlight Music Awards/.test(s[1].message), 'admin-featured event is pinned to the top');
try { await asOrg(`update events set ussd_featured = 1 where id = '20000000-0000-0000-0000-000000000001'`); ok(false, 'organiser cannot feature'); } catch (e) { ok(/Only MyVoteHub admins/.test(e.message), 'organiser cannot feature or hide events'); }
await db.exec(`update events set ussd_hidden = true where id = '20000000-0000-0000-0000-000000000002'`);
s = await dial('0244123456', ['2']);
ok(!/Campus Poll/.test(s[1].message), 'admin-hidden event disappears from USSD');

// set_ussd_config guards
try { await asOrg(`select set_ussd_config('{}')`); ok(false, 'organiser config'); } catch (e) { ok(/admins/.test(e.message), 'organisers cannot edit the menu'); }
try { await db.exec(`select set_config('request.uid', '', false)`); await db.query(`select set_ussd_config('{"options":[{"key":"code","on":false},{"key":"browse","on":false},{"key":"check","on":false}]}')`); ok(false, 'all off'); } catch (e) { ok(/admins|at least one/.test(e.message), 'cannot switch every option off (or call as non-admin)'); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
