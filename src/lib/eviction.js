// Evictions and rounds for reality-show style events.
import { useDB, useSession } from '../data/store';
import { nowISO } from './format';
import { categoryResults } from './results';

export function evict(event, nominee, reason, mode = 'manual') {
  const db = useDB.getState();
  const round = event.rounds?.current ?? null;
  db.update('nominees', nominee.id, { status: 'evicted', evictedRound: round });
  db.add('evictions', { eventId: event.id, categoryId: nominee.categoryId, nomineeId: nominee.id, round, mode, reason, by: useSession.getState().userId, at: nowISO() });
  db.log('Nominee evicted', `${nominee.name} — ${reason}`, { eventId: event.id, companyId: event.companyId });
}

export function reinstate(event, nominee) {
  const db = useDB.getState();
  db.update('nominees', nominee.id, { status: 'active', evictedRound: null });
  db.evictions.filter((e) => e.nomineeId === nominee.id).forEach((e) => db.remove('evictions', e.id));
  db.log('Nominee reinstated', nominee.name, { eventId: event.id, companyId: event.companyId });
}

/** Turns rounds on for an event that didn't have them. */
export function enableRounds(event, carryOver = false, autoEvict = 1) {
  useDB.getState().update('events', event.id, { rounds: { current: 1, carryOver, autoEvict, list: [{ n: 1, label: 'Week 1', closedAt: null }] } });
}

/**
 * Closes the current round: auto-evicts the lowest `count` competitors in each category, then opens the next round.
 * Returns the evicted nominees.
 */
export function closeRound(event, count = event.rounds?.autoEvict ?? 1) {
  const db = useDB.getState();
  const r = event.rounds;
  if (!r) return [];
  const out = [];
  db.categories
    .filter((c) => c.eventId === event.id)
    .forEach((cat) => {
      const res = categoryResults(event, cat, db, { round: r.current, withJudges: true });
      const competing = res.rows.filter((x) => x.competing);
      if (competing.length <= 1) return;
      competing.slice(-Math.min(count, competing.length - 1)).forEach((row) => out.push(row.nominee));
    });
  out.forEach((nom) => evict(event, nom, `Lowest score in ${r.list.find((x) => x.n === r.current)?.label || `Round ${r.current}`}`, 'auto'));
  const next = r.current + 1;
  db.update('events', event.id, {
    rounds: { ...r, current: next, list: [...r.list.map((x) => (x.n === r.current ? { ...x, closedAt: nowISO() } : x)), { n: next, label: `Week ${next}`, closedAt: null }] },
  });
  db.log('Round closed', `${event.title} ${r.list.find((x) => x.n === r.current)?.label} — ${out.length} evicted`, { eventId: event.id, companyId: event.companyId });
  return out;
}
