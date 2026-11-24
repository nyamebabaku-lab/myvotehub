// Payment providers for MyVoteHub: Paystack (direct MoMo prompt, card checkout, transfers)
// and Hubtel (Receive Money, Online Checkout, Send Money).
//
// Secrets (set with scripts/set-payment-keys.sh, never in code or chat):
//   PAYSTACK_SECRET_KEY                      sk_test_… or sk_live_…
//   HUBTEL_API_ID, HUBTEL_API_KEY            API keys from the Hubtel merchant dashboard
//   HUBTEL_POS_ID                            POS Sales ID (receiving money)
//   HUBTEL_PREPAID_ID                        Prepaid deposit account (sending money)
//   HUBTEL_RELAY_URL, HUBTEL_RELAY_KEY       fixed-IP relay (relay/hubtel-relay.mjs); Hubtel only accepts whitelisted IPs
//   PAY_CALLBACK_KEY                         secret in Hubtel callback URLs
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const env = (k: string) => Deno.env.get(k) || '';
export const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
export const FN_URL = `${env('SUPABASE_URL')}/functions/v1/pay`;
export const SITE = env('PUBLIC_SITE') || 'https://nyamebabaku-lab.github.io/myvotehub/';

export type Method = 'mtn' | 'telecel' | 'airteltigo' | 'card' | 'momo';
/** What the voter's screen should do next. */
export type ChargeResult =
  | { status: 'pending'; message: string; providerRef?: string }
  | { status: 'otp'; message: string; providerRef?: string }
  | { status: 'redirect'; url: string; providerRef?: string }
  | { status: 'success'; providerRef?: string; paid: number; cardVoter?: string }
  | { status: 'failed'; message: string };
export type Verify = { status: 'success'; paid: number; providerRef?: string; cardVoter?: string; raw: unknown } | { status: 'failed'; message: string; raw: unknown } | { status: 'pending' };

/** 0244123456 / 233244123456 → 0244123456 */
export const local = (p: string) => { const d = (p || '').replace(/\D/g, ''); return d.startsWith('233') && d.length === 12 ? '0' + d.slice(3) : d; };
export const intl = (p: string) => '233' + local(p).slice(1);
/** Network from the number prefix (used by USSD, where the caller doesn't pick one). */
export function networkOf(p: string): Method {
  const pre = local(p).slice(0, 3);
  if (['020', '050'].includes(pre)) return 'telecel';
  if (['026', '027', '056', '057'].includes(pre)) return 'airteltigo';
  return 'mtn';
}
const voterEmail = (phone: string, email?: string) => (email && /.+@.+\..+/.test(email) ? email : `${local(phone) || 'voter'}@voters.myvotehub.app`);

// ---------------------------------------------------------------- Paystack
const PS = 'https://api.paystack.co';
const PS_NET: Record<string, string> = { mtn: 'mtn', momo: 'mtn', telecel: 'vod', airteltigo: 'atl' };
async function paystack(path: string, body?: unknown, method = body ? 'POST' : 'GET') {
  const r = await fetch(PS + path, { method, headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.status !== false, j, data: j.data || {} };
}
const psMessage = (j: any, fallback: string) => j?.data?.gateway_response || j?.data?.message || j?.message || fallback;

function psCharge(data: any, j: any): ChargeResult {
  const s = data.status;
  if (s === 'success') return { status: 'success', paid: data.amount / 100, providerRef: String(data.id || ''), cardVoter: data.channel === 'card' && data.authorization?.last4 ? `card-${data.authorization.last4}` : undefined };
  if (s === 'send_otp') return { status: 'otp', message: data.display_text || 'Enter the code sent to your phone by SMS.' };
  if (s === 'pay_offline' || s === 'pending' || s === 'ongoing') return { status: 'pending', message: data.display_text || 'Approve the prompt on your phone by entering your MoMo PIN.' };
  return { status: 'failed', message: psMessage(j, 'The payment was declined') };
}

export const paystackPay = {
  configured: () => !!env('PAYSTACK_SECRET_KEY'),
  async momo(ref: string, amount: number, phone: string, method: Method, email?: string): Promise<ChargeResult> {
    const { ok, j, data } = await paystack('/charge', {
      email: voterEmail(phone, email), amount: Math.round(amount * 100), currency: 'GHS', reference: ref,
      mobile_money: { phone: local(phone), provider: PS_NET[method] || 'mtn' }, metadata: { source: 'MyVoteHub' },
    });
    if (!ok && !data.status) return { status: 'failed', message: psMessage(j, 'Could not start the MoMo payment') };
    return psCharge(data, j);
  },
  async otp(ref: string, otp: string): Promise<ChargeResult> {
    const { ok, j, data } = await paystack('/charge/submit_otp', { otp, reference: ref });
    if (!ok && !data.status) return { status: 'failed', message: psMessage(j, 'Wrong code') };
    return psCharge(data, j);
  },
  async card(ref: string, amount: number, email?: string): Promise<ChargeResult> {
    const { ok, j, data } = await paystack('/transaction/initialize', {
      email: voterEmail('', email), amount: Math.round(amount * 100), currency: 'GHS', reference: ref, channels: ['card'],
      callback_url: `${SITE}paid.html`, metadata: { source: 'MyVoteHub' },
    });
    return ok ? { status: 'redirect', url: data.authorization_url } : { status: 'failed', message: psMessage(j, 'Could not open card checkout') };
  },
  async verify(ref: string): Promise<Verify> {
    const { j, data } = await paystack(`/transaction/verify/${encodeURIComponent(ref)}`);
    if (data.status === 'success') return { status: 'success', paid: data.amount / 100, providerRef: String(data.id), cardVoter: data.channel === 'card' && data.authorization?.last4 ? `card-${data.authorization.last4}` : undefined, raw: data };
    if (['failed', 'abandoned', 'reversed'].includes(data.status)) return { status: 'failed', message: data.gateway_response || 'Payment not completed', raw: data };
    if (j?.status === false && /not found/i.test(j.message || '')) return { status: 'pending' };
    return { status: 'pending' };
  },
  /** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
  async validSignature(raw: string, sig: string | null) {
    if (!sig) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('PAYSTACK_SECRET_KEY')), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
    const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex.length === sig.length && hex.split('').every((c, i) => c === sig[i]);
  },
  /** Transfer references must be lowercase, 16–50 characters. */
  transferRef: (wd: string) => `myvotehub-${wd.toLowerCase()}`,
  fromTransferRef: (r: string) => { const s = r.replace(/^myvotehub-/, ''); return 'WD' + s.slice(2); },
  async payout(wd: string, amount: number, dest: any, company: string): Promise<{ status: 'paid' | 'processing' | 'failed'; message?: string; providerRef?: string }> {
    let recipient: any;
    if (dest?.type === 'bank') {
      const banks = await paystack('/bank?currency=GHS&type=ghipss');
      const want = String(dest.bank || '').toLowerCase().replace(/bank|ghana|limited|ltd|plc|\(|\)/g, '').trim();
      const bank = (banks.data as any[] || []).find((b) => b.name.toLowerCase().includes(want) || want.includes(b.name.toLowerCase().replace(/bank|ghana|limited|ltd|plc/g, '').trim()));
      if (!bank) return { status: 'failed', message: `Paystack does not list "${dest.bank}". Pay it manually and mark it paid.` };
      recipient = { type: 'ghipss', bank_code: bank.code };
    } else {
      recipient = { type: 'mobile_money', bank_code: { mtn: 'MTN', telecel: 'VOD', vodafone: 'VOD', airteltigo: 'ATL' }[String(dest?.network || 'mtn')] || 'MTN' };
    }
    const rec = await paystack('/transferrecipient', { ...recipient, name: dest?.name || company, account_number: dest?.type === 'bank' ? dest.number : local(dest?.number || ''), currency: 'GHS' });
    if (!rec.ok) return { status: 'failed', message: psMessage(rec.j, 'Paystack rejected the payout account') };
    const t = await paystack('/transfer', { source: 'balance', amount: Math.round(amount * 100), recipient: rec.data.recipient_code, reference: this.transferRef(wd), reason: `MyVoteHub payout ${wd}`, currency: 'GHS' });
    if (!t.ok) return { status: 'failed', message: psMessage(t.j, 'Paystack could not send the payout') };
    if (t.data.status === 'success') return { status: 'paid', providerRef: t.data.transfer_code };
    if (t.data.status === 'otp') return { status: 'failed', message: 'Paystack asks for an OTP on transfers. Turn off "Confirm transfers with OTP" in the Paystack dashboard (Settings → Preferences), then retry.' };
    if (t.data.status === 'failed') return { status: 'failed', message: t.data.reason || 'Payout failed' };
    return { status: 'processing', providerRef: t.data.transfer_code };
  },
};

// ---------------------------------------------------------------- Hubtel
const HUB_NET: Record<string, string> = { mtn: 'mtn-gh', momo: 'mtn-gh', telecel: 'vodafone-gh', airteltigo: 'tigo-gh' };
const hubAuth = () => 'Basic ' + btoa(`${env('HUBTEL_API_ID')}:${env('HUBTEL_API_KEY')}`);
const hubCallback = (kind: string) => `${FN_URL}/hubtel?kind=${kind}&key=${env('PAY_CALLBACK_KEY')}`;
/** Receive/Send Money and the status API only accept whitelisted IPs, so they go through the relay. */
async function hubtel(url: string, body?: unknown, viaRelay = true) {
  const init = { method: body ? 'POST' : 'GET', headers: { Authorization: hubAuth(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined };
  const r = viaRelay
    ? await fetch(env('HUBTEL_RELAY_URL'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-Key': env('HUBTEL_RELAY_KEY') }, body: JSON.stringify({ url, ...init }) })
    : await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

export const hubtelPay = {
  configured: () => !!(env('HUBTEL_API_ID') && env('HUBTEL_API_KEY') && env('HUBTEL_POS_ID')),
  relay: () => !!(env('HUBTEL_RELAY_URL') && env('HUBTEL_RELAY_KEY')),
  async momo(ref: string, amount: number, phone: string, method: Method, email?: string): Promise<ChargeResult> {
    if (!this.relay()) return { status: 'failed', message: 'Hubtel MoMo needs the fixed-IP relay. Ask the MyVoteHub team to switch payments to Paystack.' };
    const { ok, j } = await hubtel(`https://rmp.hubtel.com/merchantaccount/merchants/${env('HUBTEL_POS_ID')}/receive/mobilemoney`, {
      CustomerName: 'MyVoteHub voter', CustomerMsisdn: intl(phone), CustomerEmail: voterEmail(phone, email), Channel: HUB_NET[method] || 'mtn-gh',
      Amount: amount, PrimaryCallbackUrl: hubCallback('receive'), Description: `MyVoteHub votes ${ref}`, ClientReference: ref,
    });
    if (ok && ['0001', '0000'].includes(j.ResponseCode)) return { status: 'pending', message: 'Approve the prompt on your phone by entering your MoMo PIN.', providerRef: j.Data?.TransactionId };
    return { status: 'failed', message: j.Data?.Description || j.Message || 'Hubtel could not start the payment' };
  },
  async otp(): Promise<ChargeResult> { return { status: 'failed', message: 'Not needed for Hubtel' }; },
  async card(ref: string, amount: number): Promise<ChargeResult> {
    const { ok, j } = await hubtel('https://payproxyapi.hubtel.com/items/initiate', {
      totalAmount: amount, description: `MyVoteHub votes ${ref}`, callbackUrl: hubCallback('receive'), returnUrl: `${SITE}paid.html?reference=${ref}`,
      cancellationUrl: `${SITE}paid.html?reference=${ref}`, merchantAccountNumber: env('HUBTEL_POS_ID'), clientReference: ref,
    }, false);
    return ok && j.data?.checkoutUrl ? { status: 'redirect', url: j.data.checkoutUrl } : { status: 'failed', message: j.message || 'Could not open Hubtel checkout' };
  },
  async verify(ref: string): Promise<Verify> {
    if (!this.relay()) return { status: 'pending' };
    const { j } = await hubtel(`https://api-txnstatus.hubtel.com/transactions/${env('HUBTEL_POS_ID')}/status?clientReference=${encodeURIComponent(ref)}`);
    const d = j.data || {};
    if (/^paid$/i.test(d.status)) return { status: 'success', paid: Number(d.amount), providerRef: d.transactionId, raw: d };
    if (/failed|refunded|cancel/i.test(d.status || '')) return { status: 'failed', message: 'Payment not completed', raw: d };
    return { status: 'pending' };
  },
  async payout(wd: string, amount: number, dest: any, company: string): Promise<{ status: 'paid' | 'processing' | 'failed'; message?: string; providerRef?: string }> {
    if (!this.relay() || !env('HUBTEL_PREPAID_ID')) return { status: 'failed', message: 'Hubtel payouts need the fixed-IP relay and the prepaid account ID.' };
    if (dest?.type === 'bank') return { status: 'failed', message: 'Automatic bank payouts go through Paystack. Pay it manually and mark it paid, or switch payouts to Paystack.' };
    const { ok, j } = await hubtel(`https://smp.hubtel.com/api/merchants/${env('HUBTEL_PREPAID_ID')}/send/mobilemoney`, {
      RecipientName: dest?.name || company, RecipientMsisdn: intl(dest?.number || ''), CustomerEmail: 'payouts@myvotehub.app',
      Channel: HUB_NET[String(dest?.network || 'mtn')] || 'mtn-gh', Amount: amount, PrimaryCallbackURL: hubCallback('send'),
      Description: `MyVoteHub payout ${wd}`, ClientReference: wd,
    });
    if (ok && j.ResponseCode === '0000') return { status: 'paid', providerRef: j.Data?.TransactionId };
    if (ok && j.ResponseCode === '0001') return { status: 'processing', providerRef: j.Data?.TransactionId };
    return { status: 'failed', message: j.Data?.Description || j.Message || 'Hubtel could not send the payout' };
  },
};

export const providers = { paystack: paystackPay, hubtel: hubtelPay } as const;
export type ProviderName = keyof typeof providers;

/** Sends the charge for a pending payment and records what happened. Used by the pay and ussd functions. */
export async function charge(p: { ref: string; amount: number; voter: string; method: Method; provider: ProviderName; email?: string }): Promise<ChargeResult> {
  const prov = providers[p.provider];
  let r: ChargeResult;
  try {
    if (!prov.configured()) r = { status: 'failed', message: 'Payments are not connected yet. Please try again later.' };
    else r = p.method === 'card' ? await prov.card(p.ref, p.amount, p.email) : await prov.momo(p.ref, p.amount, p.voter, p.method, p.email);
  } catch (e) {
    r = { status: 'failed', message: 'The payment service did not answer. No money was taken; please try again.' };
    console.error('charge', p.ref, e);
  }
  await record(p.ref, r);
  return r;
}

export async function record(ref: string, r: ChargeResult) {
  if (r.status === 'success') await db.rpc('complete_payment', { r: ref, pref: r.providerRef || null, paid: r.paid, info: null, card_voter: r.cardVoter || null });
  else if (r.status === 'failed') await db.rpc('fail_payment', { r: ref, reason: r.message, info: null });
  else await db.rpc('note_payment', { r: ref, msg: r.status === 'redirect' ? 'Complete the payment on the checkout page' : r.message, pref: r.providerRef || null, prov: null });
}
