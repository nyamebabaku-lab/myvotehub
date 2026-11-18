// Live check of password help: "ask an admin", admin temporary password, forced change, change from the menu.
// Needs a local `VITE_APP=main vite preview --port 4176`. Run cleanup.mjs afterwards.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const env = Object.fromEntries(readFileSync(ROOT + '.env.local', 'utf8').trim().split('\n').map((l) => l.split('=')));
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
const ADM = `e2e-admin-${T}@example.com`, ORG = `e2e-org-${T}@example.com`;
const signUp = (email, password) => fetch(`${URL_}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
const [{ cid }] = await sql(`insert into companies (name, status, kyc, join_code) values ('E2E Events ${T}', 'active', 'verified', 'P${T.slice(-5).toUpperCase()}') returning id cid`);
ok((await signUp(ADM, 'testpass123')).ok && (await signUp(ORG, 'oldpass123')).ok, 'temporary admin and organiser logins');
await sql(`insert into profiles (id, role, name, email, status, super) select id, 'admin', 'E2E Admin', email, 'active', true from auth.users where email='${ADM}';
           insert into profiles (id, role, company_id, name, email, status) select id, 'organiser', '${cid}', 'Esi Forgetful', email, 'active' from auth.users where email='${ORG}'`);

const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1148/chrome-linux/chrome' });
const errors = [];
const page = async (vp = { width: 1280, height: 900 }) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
const modal = (p) => p.locator('div.fixed.inset-0.z-50').last();
const signIn = async (p, base, email, pw) => {
  await p.goto(`${base}#/login`);
  await p.reload();
  await p.locator('input[type=email]').fill(email);
  await p.locator('input[type=password]').first().fill(pw);
  await p.locator('form').getByRole('button', { name: 'Sign in' }).click();
};
try {
  // 1. Organiser forgot their password and asks MyVoteHub for help (phone size)
  const og = await page({ width: 390, height: 844 });
  await og.goto(`${APP}#/login`);
  await og.getByRole('button', { name: 'Forgot your password?' }).click();
  await modal(og).locator('input[type=email]').fill(ORG);
  await modal(og).getByRole('button', { name: 'Ask MyVoteHub for help' }).click();
  await og.getByText('Request sent').waitFor({ timeout: 15000 });
  ok(true, '"Ask MyVoteHub for help" request sent');
  await og.screenshot({ path: 'tests/live/forgot-help.png' });
  ok((await sql(`select count(*)::int n from password_help where email='${ORG}'`))[0].n === 1, 'request stored for admins');

  // 2. Admin sees the request and sets a temporary password
  const ad = await page();
  await signIn(ad, `${APP}admin/`, ADM, 'testpass123');
  await ad.waitForURL(/#\/app/, { timeout: 20000 });
  await ad.goto(`${APP}admin/#/app/accounts`);
  await ad.getByText(/needs password help/).waitFor({ timeout: 15000 });
  ok(true, 'Accounts page shows the help request');
  await ad.locator('button', { hasText: 'Esi Forgetful' }).first().click();
  const temp = (await modal(ad).locator('code').innerText()).trim();
  ok(/^Vote-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(temp), `suggested temporary password ${temp}`);
  await modal(ad).getByRole('button', { name: 'Set temporary password' }).click();
  await ad.getByText('Temporary password set').waitFor({ timeout: 15000 });
  await ad.screenshot({ path: 'tests/live/admin-temp-password.png' });
  ok((await sql(`select must_change_password m from profiles where email='${ORG}'`))[0].m === true, 'account flagged to change password');

  // 3. Old password no longer works; temp password forces a new one
  await signIn(og, APP, ORG, 'oldpass123');
  await og.getByText('Could not sign in').waitFor({ timeout: 15000 });
  ok(true, 'old password rejected');
  await signIn(og, APP, ORG, temp);
  await og.getByText('Choose a new password').waitFor({ timeout: 20000 });
  ok(true, 'temporary password leads to "Choose a new password"');
  await og.screenshot({ path: 'tests/live/must-change.png' });
  await og.locator('input[type=password]').nth(0).fill('newpass456');
  await og.locator('input[type=password]').nth(1).fill('newpass456');
  await og.getByRole('button', { name: 'Save and continue' }).click();
  await og.getByText(/Hello, Esi/).waitFor({ timeout: 20000 });
  ok((await sql(`select must_change_password m from profiles where email='${ORG}'`))[0].m === false, 'new password saved, dashboard opens');

  // 4. Fresh sign-in with the new password, then change it from the profile menu
  const og2 = await page();
  await signIn(og2, APP, ORG, 'newpass456');
  await og2.getByText(/Hello, Esi/).waitFor({ timeout: 20000 });
  ok(true, 'signs in with the new password');
  await og2.locator('header button', { hasText: 'Esi Forgetful' }).click();
  await og2.getByRole('button', { name: 'Change password' }).click();
  await modal(og2).locator('input[type=password]').nth(0).fill('third-pass-789');
  await modal(og2).locator('input[type=password]').nth(1).fill('third-pass-789');
  await modal(og2).getByRole('button', { name: 'Save new password' }).click();
  await og2.getByText('Password changed').waitFor({ timeout: 15000 });
  const og3 = await page();
  await signIn(og3, APP, ORG, 'third-pass-789');
  await og3.getByText(/Hello, Esi/).waitFor({ timeout: 20000 });
  ok(true, 'password changed from the menu works');

  // 5. Email code path: the screen works; delivery needs Brevo (Supabase's built-in mailer refuses outside addresses)
  const og4 = await page();
  await og4.goto(`${APP}#/login`);
  await og4.getByRole('button', { name: 'Forgot your password?' }).click();
  await modal(og4).locator('input[type=email]').fill(ORG);
  await modal(og4).getByRole('button', { name: 'Email me a reset code' }).click();
  await og4.getByText(/Check your email|Could not send/).first().waitFor({ timeout: 15000 });
  const t = await og4.locator('div.fixed.inset-x-0.top-4').innerText();
  console.log('   email code response:', t.replace(/\n/g, ' | ').slice(0, 160));
  ok(/Check your email|Could not send/.test(t), 'email-code request handled (sent, or a clear message if email is not set up)');

  // 6. Legal pages
  const lp = await page({ width: 390, height: 844 });
  await lp.goto(`${APP}#/privacy`);
  await lp.getByRole('heading', { name: 'Privacy policy' }).waitFor({ timeout: 15000 });
  await lp.goto(`${APP}#/terms`);
  await lp.getByRole('heading', { name: 'Terms of use' }).waitFor({ timeout: 15000 });
  ok(true, 'privacy policy and terms pages load');
} catch (e) {
  failed++;
  console.log('✗ STOPPED:', e.message.split('\n')[0]);
}
console.log(errors.length ? 'PAGE ERRORS:\n' + [...new Set(errors)].join('\n') : 'no page errors');
await b.close();
process.exit(failed ? 1 : 0);
