// Event lifecycle: draft → pending (admin review) → approved → live → closed, then results released.
import { useDB } from '../data/store';
import { nowISO } from './format';
import { recordPayment, METHODS } from './payments';

const ctx = (e) => ({ eventId: e.id, companyId: e.companyId });

export function submitEvent(e) {
  const db = useDB.getState();
  const needs = db.settings.requireEventApproval;
  db.update('events', e.id, { status: needs ? 'pending' : 'approved', submittedAt: nowISO(), reviewNote: '' });
  db.log('Event submitted', `${e.title} ${needs ? 'sent for approval' : 'auto-approved'}`, ctx(e));
  if (needs) db.notify({ toRole: 'admin', title: 'New event to review', text: e.title, link: '/app/approvals' });
}

export function reviewEvent(e, approve, note = '') {
  const db = useDB.getState();
  db.update('events', e.id, { status: approve ? 'approved' : 'rejected', reviewNote: note, reviewedAt: nowISO() });
  db.log(approve ? 'Event approved' : 'Event rejected', `${e.title}${note ? ` — ${note}` : ''}`, ctx(e));
  db.notify({ companyId: e.companyId, title: approve ? 'Event approved 🎉' : 'Event needs changes', text: `${e.title}${note ? ` — ${note}` : ''}`, link: `/app/events/${e.id}` });
}

export function openVoting(e) {
  const db = useDB.getState();
  const patch = { status: 'live' };
  if (new Date(e.endAt).getTime() <= Date.now()) patch.endAt = new Date(Date.now() + 7 * 86400000).toISOString();
  if (new Date(e.startAt).getTime() > Date.now()) patch.startAt = nowISO();
  db.update('events', e.id, patch);
  db.log('Voting opened', e.title, ctx(e));
}

export function closeVoting(e) {
  const db = useDB.getState();
  db.update('events', e.id, { status: 'closed', endAt: new Date(Math.min(Date.now(), new Date(e.endAt).getTime())).toISOString() });
  db.log('Voting closed', e.title, ctx(e));
}

export function extendVoting(e, days) {
  const db = useDB.getState();
  const base = Math.max(Date.now(), new Date(e.endAt).getTime());
  db.update('events', e.id, { status: 'live', endAt: new Date(base + days * 86400000).toISOString() });
  db.log('Voting extended', `${e.title} by ${days} day(s)`, ctx(e));
}

/** Unseals judges' scores and publishes the weighted final results. */
export function releaseResults(e) {
  const db = useDB.getState();
  db.update('events', e.id, { resultsReleased: true, releasedAt: nowISO() });
  db.log('Results released', `${e.title} — judges' scores unsealed`, ctx(e));
}

export function withdrawResults(e) {
  const db = useDB.getState();
  db.update('events', e.id, { resultsReleased: false, releasedAt: null });
  db.log('Results hidden', e.title, ctx(e));
}

/** Short unique category code from its name, e.g. "Song of the Year" → SOY. */
export function categoryCode(name, taken) {
  const words = name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean);
  let base = (words.length > 1 ? words.map((w) => w[0]).join('') : words[0] || 'CAT').slice(0, 3).toUpperCase().padEnd(3, 'X');
  let code = base;
  let i = 2;
  while (taken.includes(code)) code = `${base.slice(0, 2)}${i++}`;
  return code;
}

export function nextNomineeCode(cat, nominees) {
  const nums = nominees.filter((n) => n.categoryId === cat.id).map((n) => Number(n.code.split('-')[1]) || 0);
  return `${cat.code}-${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`;
}

// ---------------- Demo traffic ----------------
let timer = null;
const PHONES = ['024', '054', '055', '020', '027'];
/** Adds a burst of random paid or free votes every ~1.5s so dashboards and the reveal screen move. */
export function startSimulation(eventId, onTick) {
  stopSimulation();
  timer = setInterval(() => {
    const db = useDB.getState();
    const e = db.events.find((x) => x.id === eventId);
    if (!e || e.status !== 'live') return;
    const noms = db.nominees.filter((n) => n.eventId === e.id && n.status !== 'evicted');
    if (!noms.length) return;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const nom = noms[Math.floor(Math.pow(Math.random(), 1.6) * noms.length)];
      const voter = `${PHONES[Math.floor(Math.random() * PHONES.length)]}${Math.floor(1000000 + Math.random() * 8999999)}`;
      if (e.votingMode === 'free') {
        db.add('votes', { eventId: e.id, categoryId: nom.categoryId, nomineeId: nom.id, qty: 1, voter, channel: 'web', paymentId: null, round: e.rounds?.current ?? null, at: nowISO() });
      } else {
        const b = e.bundles[Math.floor(Math.random() * e.bundles.length)];
        const pay = recordPayment({ event: e, nominee: nom, voter, method: METHODS[Math.floor(Math.random() * 3)].id, amount: b.price, votes: b.votes, ok: true });
        db.add('votes', { eventId: e.id, categoryId: nom.categoryId, nomineeId: nom.id, qty: b.votes, voter, channel: Math.random() < 0.8 ? 'web' : 'ussd', paymentId: pay.id, round: e.rounds?.current ?? null, at: nowISO() });
      }
    }
    onTick?.();
  }, 1500);
}
export function stopSimulation() {
  clearInterval(timer);
  timer = null;
}
export const simulating = () => !!timer;
