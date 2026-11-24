// Live builds: votes are cast by the server (see 0002_accounts.sql); the browser never writes votes or payments.
import { supabase, must } from './supabase';
import { deviceId } from './voting';
import { refresh } from '../data/sync';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Test-mode checkout: waits like a MoMo prompt, then the server records the payment and votes. */
export async function livePay({ nominee, qty, method, voter }) {
  await wait(2200);
  const [r] = must(await supabase.rpc('cast_test_vote', { nid: nominee.id, qty, method, voter, device: deviceId() }));
  refresh();
  return r.status === 'success' ? { ok: true, ref: r.ref } : { ok: false, ref: r.ref, error: method === 'card' ? 'Card declined by issuer' : 'Payment prompt was declined or timed out' };
}

/** Sends a free-vote code. In test mode the server returns it so it can be shown on screen. */
export const liveRequestCode = async (phone) => must(await supabase.rpc('request_free_vote_code', { phone }));

/** Casts one free vote; returns how many free votes are left in that category. */
export async function liveCastFree({ phone, code, nominee }) {
  const left = must(await supabase.rpc('cast_free_vote', { phone, code, nid: nominee.id, device: deviceId() }));
  refresh();
  return left;
}

export const liveReceipt = async (ref) => must(await supabase.rpc('receipt', { r: ref }))?.[0] || null;

// ---------------------------------------------------------------- real payments (test mode off): the `pay` Edge Function
async function payFn(route, body) {
  const { data, error } = await supabase.functions.invoke(`pay/${route}`, { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return data;
}

/** Starts a real MoMo prompt or card checkout. Returns { ref, status: pending|otp|redirect|success|failed, message?, url? }. */
export const liveCharge = ({ nominee, qty, method, phone, email }) => payFn('start', { nominee: nominee.id, qty, method, phone, email, device: deviceId() });
export const liveSubmitOtp = (ref, otp) => payFn('otp', { ref, otp });
export const livePayStatus = (ref) => payFn('status', { ref });
export const livePayout = (withdrawal) => payFn('payout', { withdrawal });
export const payHealth = async () => {
  const { data, error } = await supabase.functions.invoke('pay/health', { method: 'GET' });
  if (error) throw new Error(error.message);
  return data;
};

/** Polls until the payment is no longer pending (about 3 minutes), then refreshes the app's data. */
export async function waitForPayment(ref, { onTick, signal } = {}) {
  for (let i = 0; i < 60 && !signal?.aborted; i++) {
    await wait(i < 5 ? 2500 : 4000);
    const s = await livePayStatus(ref).catch(() => null);
    if (s) onTick?.(s);
    if (s && s.status !== 'pending') { refresh(); return s; }
  }
  return { ref, status: 'pending' };
}
