// Removes everything the live tests created (E2E companies, e2e-* logins, simulator/test sessions) and the test USSD code.
import { readFileSync } from 'fs';
const TOKEN = readFileSync(process.env.HOME + '/.supabase/access-token', 'utf8').trim();
const q = `
delete from votes where event_id in (select e.id from events e join companies c on c.id = e.company_id where c.name like 'E2E Events %');
delete from payments where company_id in (select id from companies where name like 'E2E Events %');
delete from withdrawals where company_id in (select id from companies where name like 'E2E Events %');
delete from sms_log where event_id in (select e.id from events e join companies c on c.id = e.company_id where c.name like 'E2E Events %');
delete from audit_log where company_id in (select id from companies where name like 'E2E Events %') or detail like '%E2E%' or detail like '%e2e-%' or action = 'USSD code set';
delete from notifications where company_id in (select id from companies where name like 'E2E Events %') or body like '%E2E%';
delete from events where company_id in (select id from companies where name like 'E2E Events %');
delete from profiles where email like 'e2e-%@example.com';
delete from auth.users where email like 'e2e-%@example.com';
delete from companies where name like 'E2E Events %';
delete from ussd_sessions where id like 'gen:%' or id like 'at:e2e-%' or id like 'at:t-%' or id like 'ark:t-%' or id like 'hub:t-%' or id like 'sim:%';
delete from otp_codes;
update settings set ussd_code = null;
select (select count(*) from auth.users)::int users, (select count(*) from companies)::int companies, (select count(*) from events)::int events, (select count(*) from votes)::int votes, (select count(*) from sms_log)::int sms;`;
const r = await fetch('https://api.supabase.com/v1/projects/jepkzvunetajsgscoelv/database/query', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
console.log(JSON.stringify(await r.json()));
