// Organiser wallets: net vote revenue (after commission) minus payouts.
import { useDB, useSession } from '../data/store';
import { money, nowISO, sum } from './format';
import { methodLabel } from './payments';
import { LIVE } from '../config';
import { supabase, must } from './supabase';
import { refresh } from '../data/sync';

export function walletFor(companyId, { payments, withdrawals, settings }, eventId) {
  // Live builds: test money only counts while test mode is on (the server applies the same rule).
  const counts = (x) => !LIVE || settings?.testMode || !x.isTest;
  const ok = payments.filter((p) => p.companyId === companyId && p.status === 'success' && (!eventId || p.eventId === eventId) && counts(p));
  const mine = withdrawals.filter((w) => w.companyId === companyId && counts(w));
  const gross = sum(ok, (p) => p.amount);
  const commission = sum(ok, (p) => p.commission);
  const net = sum(ok, (p) => p.net);
  const paidOut = sum(mine.filter((w) => w.status === 'paid'), (w) => w.amount + (w.fee || 0));
  const pending = sum(mine.filter((w) => w.status === 'pending'), (w) => w.amount + (w.fee || 0));
  return { gross, commission, net, paidOut, pending, available: eventId ? net : Math.max(0, net - paidOut - pending), votesSold: sum(ok, (p) => p.votes), txCount: ok.length };
}

export const destinationLabel = (d) => (!d ? '—' : d.type === 'bank' ? `${d.bank} · ${d.number}` : `${methodLabel(d.network)} · ${d.number}`);

export async function requestWithdrawal(companyId, amount, destination) {
  if (LIVE) {
    must(await supabase.rpc('request_withdrawal', { amt: amount, dest: destination }));
    return refresh();
  }
  const db = useDB.getState();
  const w = walletFor(companyId, db);
  if (amount < db.settings.minWithdrawal) throw new Error(`Minimum withdrawal is ${money(db.settings.minWithdrawal)}`);
  if (amount > w.available) throw new Error(`Only ${money(w.available)} is available`);
  const rec = db.add('withdrawals', {
    ref: `WD${Math.floor(100000 + Math.random() * 900000)}`, companyId, amount, fee: 0, destination, status: 'pending',
    requestedBy: useSession.getState().userId, requestedAt: nowISO(), decidedAt: null, decidedBy: null, note: '',
  });
  const co = db.companies.find((c) => c.id === companyId);
  db.log('Withdrawal requested', `${money(amount)} to ${destinationLabel(destination)}`, { companyId });
  db.notify({ toRole: 'admin', title: 'Withdrawal awaiting approval', text: `${co?.name} · ${money(amount)}`, link: '/app/withdrawals' });
  return rec;
}

export async function decideWithdrawal(id, approve, note = '') {
  if (LIVE) {
    must(await supabase.rpc('decide_withdrawal', { wid: id, approve, note: note || null }));
    return refresh();
  }
  const db = useDB.getState();
  const w = db.withdrawals.find((x) => x.id === id);
  if (!w || w.status !== 'pending') return;
  db.update('withdrawals', id, {
    status: approve ? 'paid' : 'rejected', note, decidedAt: nowISO(), decidedBy: useSession.getState().userId,
    payoutRef: approve ? `TRX${Math.floor(10000000 + Math.random() * 90000000)}` : undefined,
  });
  db.log(approve ? 'Withdrawal paid' : 'Withdrawal rejected', `${money(w.amount)} to ${destinationLabel(w.destination)}${note ? ` — ${note}` : ''}`, { companyId: w.companyId });
  db.notify({ companyId: w.companyId, title: approve ? 'Withdrawal paid' : 'Withdrawal rejected', text: `${money(w.amount)}${note ? ` — ${note}` : ''}`, link: '/app/wallet' });
}

/** Platform earnings: commission on every successful paid vote. */
export function platformRevenue({ payments }) {
  const ok = payments.filter((p) => p.status === 'success');
  return { commission: sum(ok, (p) => p.commission), gross: sum(ok, (p) => p.amount) };
}
