// MyVoteHub payments: voters start a MoMo or card payment, providers confirm it, admins pay organisers out.
//
//   POST /pay/start      { nominee, qty, method, phone?, email?, device? }  → { ref, status, message?, url? }
//   POST /pay/otp        { ref, otp }                                      → same shape as start
//   POST /pay/status     { ref }                                           → { ref, status, note, votes }
//   POST /pay/payout     { withdrawal }   (signed-in admin)                → { status, message? }
//   GET  /pay/health                                                       → which providers are connected
//   POST /pay/paystack   Paystack webhook (signed)
//   POST /pay/hubtel?kind=receive|send&key=…   Hubtel callbacks
//
// Votes are only counted after the provider confirms the money (webhook or a status check).
import { charge, db, env, hubtelPay, paystackPay, providers, record, type Method, type ProviderName } from '../_shared/providers.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const METHODS = ['mtn', 'telecel', 'airteltigo', 'card'];
const dbError = (e: any) => String(e?.message || e || 'Something went wrong').replace(/^.*?exception: /i, '');

async function settings() {
  const { data } = await db.from('settings').select('test_mode, pay_provider, payout_provider, auto_payout').single();
  return data as { test_mode: boolean; pay_provider: ProviderName; payout_provider: ProviderName; auto_payout: boolean };
}
const payment = async (ref: string) => (await db.from('payments').select('*').eq('ref', ref).maybeSingle()).data;
const view = async (ref: string) => {
  const p = await payment(ref);
  return p ? { ref, status: p.status, note: p.note, votes: p.votes, amount: Number(p.amount) } : { ref, status: 'unknown' };
};

/** Asks the provider whether a pending payment was paid. Gives up after 30 minutes. */
async function check(ref: string) {
  const p = await payment(ref);
  if (!p || p.status !== 'pending' || !p.provider) return;
  const v = await providers[p.provider as ProviderName].verify(ref).catch(() => ({ status: 'pending' as const }));
  if (v.status === 'success') await db.rpc('complete_payment', { r: ref, pref: v.providerRef || null, paid: v.paid, info: v.raw ?? null, card_voter: v.cardVoter || null });
  else if (v.status === 'failed') await db.rpc('fail_payment', { r: ref, reason: v.message, info: v.raw ?? null });
  else if (Date.now() - new Date(p.created_at).getTime() > 30 * 60_000) await db.rpc('fail_payment', { r: ref, reason: 'The payment was not approved in time. No money was taken.', info: null });
}

async function start(b: any) {
  const s = await settings();
  if (s.test_mode) return fail('Test mode is on: payments are simulated in the app');
  const method = String(b.method || '') as Method;
  if (!METHODS.includes(method)) return fail('Choose MTN, Telecel, AirtelTigo or card');
  const phone = String(b.phone || '').replace(/\s/g, '');
  if (method !== 'card' && !/^0\d{9}$/.test(phone)) return fail('Enter a valid phone number, e.g. 0244123456');
  const voter = method === 'card' ? 'card' : phone;
  const { data, error } = await db.rpc('start_payment', { nid: b.nominee, qty: Number(b.qty), method, voter, device: b.device || null, chan: 'web' });
  if (error) return fail(dbError(error));
  const p = data[0];
  const r = await charge({ ref: p.ref, amount: Number(p.amount), voter, method, provider: s.pay_provider, email: b.email });
  return json({ ref: p.ref, amount: Number(p.amount), ...r });
}

async function otp(b: any) {
  const p = await payment(String(b.ref || ''));
  if (!p || p.status !== 'pending') return fail('This payment is no longer waiting for a code');
  const r = await providers[p.provider as ProviderName].otp(p.ref, String(b.otp || '').trim());
  await record(p.ref, r);
  return json({ ref: p.ref, ...r });
}

async function payout(req: Request, b: any) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return fail('Sign in to the Admin app first', 401);
  const { data, error } = await db.rpc('begin_payout', { wid: b.withdrawal, admin: u.user.id });
  if (error) return fail(dbError(error));
  const w = data[0];
  const prov = providers[w.provider as ProviderName];
  let r: { status: string; message?: string; providerRef?: string };
  try {
    r = prov.configured() ? await prov.payout(w.ref, Number(w.amount), w.destination, w.company) : { status: 'failed', message: `${w.provider} is not connected yet` };
  } catch (e) {
    console.error('payout', w.ref, e);
    r = { status: 'failed', message: 'The payout service did not answer. Check the provider dashboard before retrying.' };
  }
  if (r.status === 'paid' || r.status === 'failed') await db.rpc('finish_payout', { r: w.ref, ok: r.status === 'paid', pref: r.providerRef || null, reason: r.message || null, info: null });
  else await db.from('withdrawals').update({ payout_ref: r.providerRef || null }).eq('id', w.id);
  return json({ ref: w.ref, ...r });
}

async function paystackWebhook(req: Request) {
  const raw = await req.text();
  if (!(await paystackPay.validSignature(raw, req.headers.get('x-paystack-signature')))) return new Response('Bad signature', { status: 401 });
  const e = JSON.parse(raw);
  const d = e.data || {};
  if (e.event === 'charge.success') {
    // Confirm with Paystack too, so the amount and status come from Paystack's own record.
    const v = await paystackPay.verify(d.reference);
    if (v.status === 'success') await db.rpc('complete_payment', { r: d.reference, pref: v.providerRef || null, paid: v.paid, info: v.raw ?? null, card_voter: v.cardVoter || null });
  } else if (e.event === 'transfer.success' || e.event === 'transfer.failed' || e.event === 'transfer.reversed') {
    await db.rpc('finish_payout', { r: paystackPay.fromTransferRef(d.reference || ''), ok: e.event === 'transfer.success', pref: d.transfer_code || null,
      reason: e.event === 'transfer.success' ? null : d.reason || d.gateway_response || 'Payout failed', info: d });
  }
  return new Response('ok');
}

async function hubtelCallback(url: URL, b: any) {
  if (!env('PAY_CALLBACK_KEY') || url.searchParams.get('key') !== env('PAY_CALLBACK_KEY')) return new Response('Forbidden', { status: 403 });
  const d = b.Data || b.data || {};
  const ref = d.ClientReference || d.clientReference;
  if (url.searchParams.get('kind') === 'send') {
    await db.rpc('finish_payout', { r: ref, ok: b.ResponseCode === '0000', pref: d.TransactionId || null, reason: b.ResponseCode === '0000' ? null : d.Description || 'Payout failed', info: b });
  } else if (b.ResponseCode === '0000') {
    // Callbacks are not signed, so the result is confirmed with Hubtel's status API before counting votes.
    const v = await hubtelPay.verify(ref);
    if (v.status === 'success') await db.rpc('complete_payment', { r: ref, pref: v.providerRef || d.TransactionId || null, paid: v.paid, info: b, card_voter: null });
  } else if (ref) {
    await db.rpc('fail_payment', { r: ref, reason: d.Description || 'Payment not completed', info: b });
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const route = url.pathname.split('/').filter(Boolean).pop();
  try {
    if (route === 'paystack') return await paystackWebhook(req);
    const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    if (route === 'hubtel') return await hubtelCallback(url, b);
    if (route === 'health') {
      const s = await settings();
      const key = env('PAYSTACK_SECRET_KEY');
      return json({ testMode: s.test_mode, payProvider: s.pay_provider, payoutProvider: s.payout_provider,
        paystack: { connected: !!key, mode: key.startsWith('sk_live_') ? 'live' : key ? 'test' : null },
        hubtel: { connected: hubtelPay.configured(), relay: hubtelPay.relay(), payouts: !!env('HUBTEL_PREPAID_ID') } });
    }
    if (route === 'start') return await start(b);
    if (route === 'otp') return await otp(b);
    if (route === 'status') { await check(String(b.ref || '')); return json(await view(String(b.ref || ''))); }
    if (route === 'payout') return await payout(req, b);
    return fail('Not found', 404);
  } catch (e) {
    console.error(route, e);
    return fail('Something went wrong. No money was taken; please try again.', 500);
  }
});
