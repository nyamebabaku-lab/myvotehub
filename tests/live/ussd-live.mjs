// Live USSD test: real gateway calls, nominee dashboard and Admin simulator against the real database.
// Everything it creates is named E2E / e2e-* and removed by cleanup.mjs.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const ROOT = '/home/BrandsME/projects/myvotehub/';
const env = Object.fromEntries(readFileSync(ROOT + '.env.local', 'utf8').trim().split('\n').map((l) => l.split('=')));
const KEY = readFileSync(ROOT + 'supabase/functions/.env', 'utf8').trim().split('=')[1];
const TOKEN = readFileSync(process.env.HOME + '/.supabase/access-token', 'utf8').trim();
const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
const GW = `${URL_}/functions/v1/ussd`;
const APP = 'http://localhost:4176/';
async function sql(query) {
  const r = await fetch('https://api.supabase.com/v1/projects/jepkzvunetajsgscoelv/database/query', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j;
}
let failed = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) failed++; };
const T = Date.now().toString(36);

// ---- data
const [{ cid }] = await sql(`insert into companies (name, status, kyc, join_code) values ('E2E Events ${T}', 'active', 'verified', 'E2E${T.slice(-3).toUpperCase()}') returning id cid`);
const [{ eid }] = await sql(`insert into events (company_id, title, start_at, end_at, status, bundles, price_per_vote) values ('${cid}', 'E2E Music Awards', now()-interval '1 hour', now()+interval '3 days', 'live', '[{"votes":1,"price":1},{"votes":10,"price":9}]', 1) returning id eid`);
const [{ fid }] = await sql(`insert into events (company_id, title, start_at, end_at, status, voting_mode, free_votes_per_voter) values ('${cid}', 'E2E Campus Poll', now()-interval '1 hour', now()+interval '3 days', 'live', 'free', 1) returning id fid`);
const [{ cat }] = await sql(`insert into categories (event_id, name, code) values ('${eid}', 'Artiste of the Year', 'AOY') returning id cat`);
const [{ fcat }] = await sql(`insert into categories (event_id, name, code) values ('${fid}', 'Best Lecturer', 'LEC') returning id fcat`);
const noms = await sql(`insert into nominees (event_id, category_id, name, code) values ('${eid}', '${cat}', 'Kwesi Blaze', 'AOY-01'), ('${eid}', '${cat}', 'Adjoa Melody', 'AOY-02'), ('${fid}', '${fcat}', 'Dr. Mensah', 'LEC-01') returning id, code`);
const nid = noms.find((n) => n.code === 'AOY-01').id;

// ---- gateway: Africa's Talking format (cumulative text)
async function at(sessionId, phone, steps) {
  let text = '', out;
  for (const s of ['', ...steps]) {
    text = s === '' && text === '' ? '' : text ? `${text}*${s}` : s;
    const r = await fetch(`${GW}?provider=africastalking&key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ sessionId, phoneNumber: phone, serviceCode: '*384*1#', text }) });
    out = await r.text();
    if (out.startsWith('END')) break;
  }
  return out;
}
let r = await at(`e2e-${T}-1`, '+233244123456', ['1', 'AOY-01', '2', '1']);
ok(/^END TEST MODE/.test(r) && /10 votes for Kwesi Blaze/.test(r), `code flow via gateway: ${r.split('\n')[1]}`);
r = await at(`e2e-${T}-2`, '+233201112233', ['2', '1', '1', '3', '5', '1']);
ok(/5 votes for Kwesi Blaze/.test(r), 'browse flow → other amount 5 via gateway');
r = await at(`e2e-${T}-3`, '+233201112233', ['1', 'LEC-01', '1']);
ok(/free vote for Dr. Mensah is counted/.test(r), 'free vote via gateway');
r = await at(`e2e-${T}-4`, '+233201112233', ['3', 'AOY-01']);
ok(/has 15 votes/.test(r), `check votes via gateway: ${r}`);
const v = await sql(`select channel, sum(qty)::int q from votes where event_id in ('${eid}','${fid}') group by channel`);
ok(v.length === 1 && v[0].channel === 'ussd' && v[0].q === 16, 'all 16 votes stored as USSD');

// ---- add a web vote so totals mix channels
const wr = await fetch(`${URL_}/rest/v1/rpc/cast_test_vote`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json', 'Content-Profile': 'public' }, body: JSON.stringify({ nid, qty: 1, method: 'mtn', voter: '0551234567', device: 'e2e' }) });
ok(wr.ok, 'plus 1 web vote');

const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1148/chrome-linux/chrome' });
const errors = [];
const page = async (vp = { width: 390, height: 844 }) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
try {
  // ---- nominee dashboard
  const [{ token }] = await sql(`insert into nominee_links (nominee_id) values ('${nid}') returning token`);
  const nd = await page();
  await nd.goto(`${APP}#/me/${token}`);
  await nd.getByText('Total votes').waitFor({ timeout: 20000 });
  await nd.waitForTimeout(1500);
  const body = await nd.locator('body').innerText();
  ok(/\b16\b/.test(body), 'nominee dashboard shows combined total 16 (15 USSD + 1 web)');
  ok(!/USSD votes|Web votes|web vs/i.test(body), 'nominee dashboard has no web/USSD split');
  ok(/1st/.test(body), 'nominee sees their position');
  await nd.screenshot({ path: 'shots/nominee-dashboard.png', fullPage: true });
  const bad = await page();
  await bad.goto(`${APP}#/me/notarealtoken`);
  await bad.getByText('This link doesn’t work').waitFor({ timeout: 15000 });
  ok(true, 'wrong link shows a friendly error');

  // ---- public event page shows one combined count
  const pub = await page();
  await pub.goto(`${APP}#/e/${eid}/n/${nid}`);
  await pub.getByText('16').first().waitFor({ timeout: 20000 });
  ok(!(await pub.getByText(/USSD votes/i).count()), 'public nominee page shows 16 with no channel split');

  // ---- temporary admin → simulator
  const email = `e2e-admin-${T}@example.com`;
  const su = await fetch(`${URL_}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json', 'Content-Profile': 'public' }, body: JSON.stringify({ email, password: 'testpass123' }) });
  ok(su.ok, 'temporary admin login created');
  await sql(`insert into profiles (id, role, name, title, email, status, super) select id, 'admin', 'E2E Admin', 'Tester', email, 'active', true from auth.users where email='${email}'`);
  const ad = await page({ width: 1280, height: 900 });
  await ad.goto(`${APP}admin/#/login`);
  await ad.locator('input[type=email]').fill(email);
  await ad.locator('input[type=password]').fill('testpass123');
  await ad.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await ad.getByText('Platform overview').waitFor({ timeout: 20000 });
  await ad.goto(`${APP}admin/#/app/ussd`);
  await ad.getByText('Your USSD code').waitFor({ timeout: 15000 });
  await ad.getByPlaceholder('*713*44#').fill('*713*44#');
  await ad.getByRole('button', { name: 'Save' }).click();
  await ad.waitForTimeout(1500);
  await ad.getByRole('button', { name: 'Dial' }).click();
  await ad.getByText('Welcome to MyVoteHub').waitFor({ timeout: 15000 });
  for (const s of ['1', 'AOY-02', '2', '1']) {
    await ad.getByLabel('Reply').fill(s);
    await ad.getByRole('button', { name: /Send/ }).click();
    await ad.waitForTimeout(1200);
  }
  await ad.getByText(/10 votes for Adjoa Melody added/).waitFor({ timeout: 15000 });
  ok(true, 'Admin simulator: code → bundle → confirm adds 10 votes');
  await ad.getByRole('button', { name: 'Refresh' }).click();
  await ad.waitForTimeout(1500);
  ok((await ad.getByText(/Adjoa Melody \(AOY-02\) received/).count()) > 0, 'simulated SMS receipt appears in the log');
  await ad.screenshot({ path: 'shots/admin-ussd.png' });
  const evp = await page();
  await evp.goto(`${APP}#/e/${eid}`);
  await evp.getByText('*713*44#').first().waitFor({ timeout: 20000 });
  ok(true, 'event page shows the USSD code once set');
} catch (e) {
  failed++;
  console.log('✗ STOPPED:', e.message.split('\n')[0]);
}
console.log(errors.length ? 'PAGE ERRORS:\n' + [...new Set(errors)].join('\n') : 'no page errors');
await b.close();
process.exit(failed ? 1 : 0);
