// Live accounts: Supabase email + password sign-in. Every new account waits for a MyVoteHub admin.
import { supabase, must } from './supabase';
import { useDB, useSession } from '../data/store';
import { fromRow } from '../data/mapping';
import { startSync, stopSync, refresh } from '../data/sync';

export const STATUS = {
  pending: { label: 'Waiting for approval', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  suspended: { label: 'Suspended', tone: 'red' },
  deactivated: { label: 'Deactivated', tone: 'slate' },
};

const clean = (email) => email.trim().toLowerCase();

/** The signed-in user's profile, or null when signed out or not registered yet. */
export async function fetchProfile() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const p = must(await supabase.rpc('my_profile'));
  return p?.id ? fromRow('users', p) : { unregistered: true, email: data.session.user.email };
}

/** Puts the profile into the store and starts syncing (public data only until the account is active). */
export async function enter(profile) {
  useSession.getState().login(profile?.id || null);
  useDB.setState((s) => ({ me: profile, users: profile?.id ? [profile, ...s.users.filter((u) => u.id !== profile.id)] : s.users }));
  await startSync(profile?.status === 'active' ? profile : null);
  useDB.setState({ loaded: true });
  return profile;
}

export async function signIn(email, password) {
  must(await supabase.auth.signInWithPassword({ email: clean(email), password }));
  return fetchProfile();
}

/** Signs in, or creates the login if the email is new (used by every sign-up form). */
async function signUpOrIn(email, password) {
  const { error } = await supabase.auth.signUp({ email: clean(email), password });
  if (error) {
    if (!/already registered/i.test(error.message)) throw new Error(error.message);
    must(await supabase.auth.signInWithPassword({ email: clean(email), password }));
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Could not sign in. Check your password.');
}

export async function registerCompany({ email, password, company, name, title, phone }) {
  await signUpOrIn(email, password);
  must(await supabase.rpc('register_company', { company, full_name: name, job_title: title || null, phone: phone || null }));
  return fetchProfile();
}

export const companyByCode = async (code) => must(await supabase.rpc('company_by_code', { code }))?.[0] || null;

export async function joinCompany({ email, password, code, role, name, title, phone }) {
  await signUpOrIn(email, password);
  must(await supabase.rpc('join_company', { code, member_role: role, full_name: name, job_title: title || null, phone: phone || null }));
  return fetchProfile();
}

export const superAdminExists = async () => must(await supabase.rpc('super_admin_exists'));

/** Admin app sign-up: the reserved email becomes Super Admin; anyone else asks for admin access. */
export async function requestAdmin({ email, password, name, phone }) {
  await signUpOrIn(email, password);
  const existing = await fetchProfile();
  if (existing?.id) return existing;
  if (!(await superAdminExists())) {
    const { error } = await supabase.rpc('claim_super_admin', { full_name: name });
    if (!error) return fetchProfile();
    if (!/reserved/i.test(error.message)) throw new Error(error.message);
  }
  must(await supabase.rpc('request_admin', { full_name: name, phone: phone || null }));
  return fetchProfile();
}

export async function signOut() {
  stopSync();
  await supabase.auth.signOut();
  useSession.getState().logout();
  useDB.getState().clearPrivate();
  await startSync(null);
}

export async function changePassword(next) {
  if (next.length < 8) throw new Error('Use at least 8 characters');
  must(await supabase.auth.updateUser({ password: next }));
  must(await supabase.rpc('password_changed'));
}

// ---------------------------------------------------------------- forgot password
/** Emails a recovery code (needs the project's email sender to be set up). */
export async function sendResetCode(email) {
  must(await supabase.auth.resetPasswordForEmail(clean(email)));
}

/** Checks the emailed code, signs the user in and sets their new password. */
export async function resetWithCode(email, code, next) {
  if (next.length < 8) throw new Error('Use at least 8 characters');
  must(await supabase.auth.verifyOtp({ email: clean(email), token: code.trim(), type: 'recovery' }));
  await changePassword(next);
  return fetchProfile();
}

/** For people who can't get the email: MyVoteHub admins are notified and can set a temporary password. */
export const requestPasswordHelp = async (email) => must(await supabase.rpc('request_password_help', { addr: clean(email) }));

/** A readable temporary password, e.g. "Vote-7K3P-92". */
export function tempPassword() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = (n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => abc[x % abc.length]).join('');
  return `Vote-${pick(4)}-${pick(2)}`;
}

// ---------------------------------------------------------------- Admin app
const after = async (p) => {
  const r = must(await p);
  await refresh();
  return r;
};
export const setAccountStatus = (id, status, reason) => after(supabase.rpc('set_account_status', { target: id, new_status: status, reason: reason || null }));
export const setCompanyStatus = (id, status, reason) => after(supabase.rpc('set_company_status', { cid: id, new_status: status, reason: reason || null }));
export const deleteAccount = (id) => after(supabase.rpc('delete_account', { target: id }));
export const setAdminRole = (id, makeSuper) => after(supabase.rpc('set_admin_role', { target: id, make_super: makeSuper }));
export const adminResetPassword = (id, temp) => after(supabase.rpc('admin_reset_password', { target: id, temp_password: temp }));
export const setTestMode = (flag) => after(supabase.rpc('set_test_mode', { flag }));
export const clearTestData = () => after(supabase.rpc('clear_test_data'));
export const setPaymentConfig = (pay, payout, auto) => after(supabase.rpc('set_payment_config', { pay, payout, auto }));
