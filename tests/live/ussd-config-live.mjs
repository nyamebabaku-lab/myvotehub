// Live check of the editable USSD flow: Admin menu editor + featured events, organiser USSD card,
// then the real gateway. Needs a local `VITE_APP=main vite preview --port 4176`. Run cleanup.mjs afterwards.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const env = Object.fromEntries(readFileSync(ROOT + '.env.local', 'utf8').trim().split('\n').map((l) => l.split('=')));
const KEY = readFileSync(ROOT + 'supabase/functions/.env', 'utf8').trim().split('=')[1];
const TOKEN = readFileSync(process.env.HOME + '/.supabase/access-token', 'utf8').trim();
const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
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
const signUp = async (email) => fetch(`${URL_}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'testpass123' }) });
async function at(sessionId, steps) {
  let text = '', out;
  for (const s of ['', ...steps]) {
    text = s === '' && text === '' ? '' : text ? `${text}*${s}` : s;
    const r = await fetch(`${URL_}/functions/v1/ussd?provider=africastalking&key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ sessionId, phoneNumber: '+233244123456', serviceCode: '*384*1#', text }) });
    out = await r.text();
    if (out.startsWith('END')) break;
  }
  return out;
}

const [{ cid }] = await sql(`insert into companies (name, status, kyc, join_code) values ('E2E Events ${T}', 'active', 'verified', 'C${T.slice(-5).toUpperCase()}') returning id cid`);
const [{ eid }] = await sql(`insert into events (company_id, title, start_at, end_at, status, bundles, price_per_vote) values ('${cid}', 'E2E Music Awards', now()-interval '1 hour', now()+interval '3 days', 'live', '[{"votes":1,"price":1},{"votes":10,"price":9},{"votes":50,"price":40}]', 1) returning id eid`);
await sql(`insert into events (company_id, title, start_at, end_at, status) values ('${cid}', 'E2E Second Show', now()-interval '1 hour', now()+interval '1 day', 'live')`);
const [{ cat }] = await sql(`insert into categories (event_id, name, code) values ('${eid}', 'Artiste of the Year', 'AOY') returning id cat`);
await sql(`insert into nominees (event_id, category_id, name, code) values ('${eid}', '${cat}', 'Kwesi Blaze', 'AOY-01')`);
const ADM = `e2e-admin-${T}@example.com`, ORG = `e2e-org-${T}@example.com`;
ok((await signUp(ADM)).ok && (await signUp(ORG)).ok, 'temporary admin and organiser logins');
await sql(`insert into profiles (id, role, name, email, status, super) select id, 'admin', 'E2E Admin', email, 'active', true from auth.users where email='${ADM}';
           insert into profiles (id, role, company_id, name, email, status) select id, 'organiser', '${cid}', 'E2E Organiser', email, 'active' from auth.users where email='${ORG}'`);

const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1148/chrome-linux/chrome' });
const errors = [];
const page = async () => { const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
const login = async (p, base, email) => {
  await p.goto(`${base}#/login`);
  await p.locator('input[type=email]').fill(email);
  await p.locator('input[type=password]').first().fill('testpass123');
  await p.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL(/#\/app/, { timeout: 20000 });
  await p.waitForTimeout(1500);
};
try {
  // ---- Admin: wording, options, pin
  const ad = await page();
  await login(ad, `${APP}admin/`, ADM);
  await ad.goto(`${APP}admin/#/app/ussd`);
  await ad.getByText('Menu editor').waitFor({ timeout: 15000 });
  await ad.getByPlaceholder('Welcome to MyVoteHub').fill('Akwaaba! MyVoteHub');
  await ad.getByRole('button', { name: 'Move up' }).nth(1).click(); // Browse to the top
  await ad.getByRole('switch', { name: 'Show check' }).click();      // Check votes off
  const pv = await ad.locator('pre').filter({ hasText: 'Akwaaba' }).first().innerText();
  ok(pv === 'Akwaaba! MyVoteHub\n1. Browse events\n2. Vote with nominee code\n0. Exit', `editor preview: ${pv.replace(/\n/g, ' | ')}`);
  await ad.locator('button', { hasText: /^Save$/ }).filter({ has: ad.locator('svg') }).nth(1).click();
  await ad.getByText('USSD menu saved').waitFor({ timeout: 10000 });
  ok(true, 'admin saved the menu');
  const row = ad.locator('div.flex.items-center', { hasText: 'E2E Second Show' }).last();
  await row.getByRole('button', { name: 'Pin to top' }).click();
  await ad.waitForTimeout(2500);
  ok((await sql(`select ussd_featured from events where title='E2E Second Show' and company_id='${cid}'`))[0].ussd_featured === 1, 'admin pinned an event');
  await ad.screenshot({ path: 'tests/live/admin-menu-editor.png', fullPage: true }).catch(() => {});

  // ---- Organiser: USSD card
  const og = await page();
  await login(og, APP, ORG);
  await og.goto(`${APP}#/app/events/${eid}`);
  await og.getByRole('button', { name: 'Settings' }).click();
  await og.getByText('USSD voting').first().waitFor({ timeout: 15000 });
  await og.getByRole('button', { name: /^1 vote · GHS 1\.00$/ }).click();
  await og.waitForTimeout(800);
  await og.getByRole('switch', { name: 'Offer “Other amount”' }).click();
  await og.waitForTimeout(800);
  await og.getByPlaceholder('e.g. Vote for your Artiste of the Year!').fill('Vote for the king of highlife!');
  await og.locator('button', { hasText: 'Save' }).last().click();
  await og.waitForTimeout(2500);
  const ev = (await sql(`select ussd_bundles, ussd_other_amount, ussd_greeting from events where id='${eid}'`))[0];
  ok(JSON.stringify(ev.ussd_bundles?.map((x) => [x.votes, x.price])) === '[[10,9],[50,40]]' && ev.ussd_other_amount === false && ev.ussd_greeting === 'Vote for the king of highlife!', 'organiser saved bundles, Other amount off and greeting');
  await og.screenshot({ path: 'tests/live/organiser-ussd-card.png', fullPage: true }).catch(() => {});

  // ---- Real gateway reflects both
  let r = await at(`e2e-cfg-${T}-1`, []);
  ok(r === 'CON Akwaaba! MyVoteHub\n1. Browse events\n2. Vote with nominee code\n0. Exit', 'gateway shows the edited main menu');
  r = await at(`e2e-cfg-${T}-2`, ['1']);
  ok(/1\. E2E Second Show\n2\. E2E Music Awards/.test(r), 'pinned event is first in Browse');
  r = await at(`e2e-cfg-${T}-3`, ['2', 'AOY-01']);
  ok(r.startsWith('CON Vote for the king of highlife!\nVote for Kwesi Blaze (AOY-01)\n1. 10 votes GHS 9.00\n2. 50 votes GHS 40.00\n0. Back'), `vote screen: ${r.replace(/\n/g, ' | ')}`);
  r = await at(`e2e-cfg-${T}-4`, ['2', 'AOY-01', '1', '1']);
  ok(/10 votes for Kwesi Blaze added/.test(r), 'voting still works with the organiser bundles');
} catch (e) {
  failed++;
  console.log('✗ STOPPED:', e.message.split('\n')[0]);
}
console.log(errors.length ? 'PAGE ERRORS:\n' + [...new Set(errors)].join('\n') : 'no page errors');
await b.close();
process.exit(failed ? 1 : 0);
