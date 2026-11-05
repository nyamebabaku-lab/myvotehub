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
