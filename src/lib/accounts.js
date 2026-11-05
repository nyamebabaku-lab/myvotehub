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
  if (next.length < 6) throw new Error('Use at least 6 characters');
  must(await supabase.auth.updateUser({ password: next }));
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
export const setTestMode = (flag) => after(supabase.rpc('set_test_mode', { flag }));
export const clearTestData = () => after(supabase.rpc('clear_test_data'));
