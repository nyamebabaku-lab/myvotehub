// Simulated checkout. Phase 2 replaces `charge` with Paystack / Hubtel; everything else stays.
import { useDB } from '../data/store';
import { nowISO } from './format';

export const METHODS = [
  { id: 'mtn', label: 'MTN MoMo', short: 'MTN', color: 'bg-yellow-400 text-slate-900', kind: 'momo' },
  { id: 'telecel', label: 'Telecel Cash', short: 'Telecel', color: 'bg-red-600 text-white', kind: 'momo' },
  { id: 'airteltigo', label: 'AirtelTigo Money', short: 'AT', color: 'bg-blue-700 text-white', kind: 'momo' },
  { id: 'card', label: 'Visa / Mastercard', short: 'Card', color: 'bg-slate-900 text-white', kind: 'card' },
];
export const methodLabel = (id) => METHODS.find((m) => m.id === id)?.label || id;

const round2 = (n) => Math.round(n * 100) / 100;

/** Price for a number of votes: an exact bundle if one matches, otherwise the per-vote price. */
export function quote(event, votes) {
  const b = (event.bundles || []).find((x) => x.votes === votes);
  return round2(b ? b.price : votes * event.pricePerVote);
}

/**
 * Pretends to send a payment prompt and waits for approval.
 * Demo rule: a phone number ending in 000 or a card ending in 0002 is declined.
 */
export function charge({ method, account }) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const digits = String(account).replace(/\D/g, '');
      const declined = method === 'card' ? digits.endsWith('0002') : digits.endsWith('000');
      resolve(declined ? { ok: false, error: method === 'card' ? 'Card declined by issuer' : 'Payment prompt was declined or timed out' } : { ok: true });
    }, 2200);
  });
}

export const newRef = () => `MVH${Math.floor(100000 + Math.random() * 900000)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;

/** Saves the payment with the platform's commission split out. */
export function recordPayment({ event, nominee, voter, method, amount, votes, ok }) {
  const db = useDB.getState();
  const company = db.companies.find((c) => c.id === event.companyId);
  const pct = company?.commissionPct ?? db.settings.defaultCommission;
  const commission = ok ? round2((amount * pct) / 100) : 0;
  return db.add('payments', {
    ref: newRef(), eventId: event.id, companyId: event.companyId, nomineeId: nominee.id, voter, method, amount, votes,
    commissionPct: pct, commission, net: ok ? round2(amount - commission) : 0, status: ok ? 'success' : 'failed', at: nowISO(),
  });
}
