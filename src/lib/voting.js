// Voting rules: event phase, free-vote limits, fraud guards and recording votes.
import { useDB } from '../data/store';
import { nowISO, uid } from './format';

export function deviceId() {
  try {
    let d = localStorage.getItem('myvotehub-device');
    if (!d) {
      d = uid('dev');
      localStorage.setItem('myvotehub-device', d);
    }
    return d;
  } catch {
    return 'dev_unknown';
  }
}

/** What the public sees: draft | pending | rejected | upcoming | live | ended | closed. */
export function eventPhase(e, now = Date.now()) {
  if (e.status === 'live') return new Date(e.endAt).getTime() <= now ? 'ended' : 'live';
  if (e.status === 'approved') return 'upcoming';
  return e.status;
}

export const PHASE = {
  draft: { label: 'Draft', tone: 'slate' },
  pending: { label: 'Awaiting approval', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'red' },
  upcoming: { label: 'Upcoming', tone: 'blue' },
  live: { label: 'Live', tone: 'red' },
  ended: { label: 'Voting ended', tone: 'slate' },
  closed: { label: 'Closed', tone: 'slate' },
};

export const isPublic = (e) => ['upcoming', 'live', 'ended', 'closed'].includes(eventPhase(e));

export function canVote(event, nominee) {
  const phase = eventPhase(event);
  if (phase === 'upcoming') return { ok: false, reason: 'Voting has not opened yet' };
  if (phase !== 'live') return { ok: false, reason: 'Voting is closed' };
  if (nominee?.status === 'evicted') return { ok: false, reason: 'This nominee has been evicted' };
  return { ok: true };
}

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Free votes this voter has left in a category (per event, or per day for daily polls). */
export function freeVotesLeft(event, categoryId, voter) {
  if (!voter) return event.freeVotesPerVoter;
  const since = event.freePeriod === 'daily' ? startOfDay() : 0;
  const used = useDB
    .getState()
    .votes.filter((v) => v.eventId === event.id && v.categoryId === categoryId && v.voter === voter && !v.void && new Date(v.at).getTime() >= since)
    .reduce((a, v) => a + v.qty, 0);
  return Math.max(0, event.freeVotesPerVoter - used);
}

/** Demo OTP: a real build sends this by SMS. */
export const sendOtp = () => String(100000 + Math.floor(Math.random() * 900000));

/** Records votes, flagging bursts from one device so organisers can review them. */
export function castVotes({ event, nominee, qty, voter, paymentId = null, channel = 'web' }) {
  const db = useDB.getState();
  const dev = deviceId();
  const minuteAgo = Date.now() - 60000;
  const recent = db.votes.filter((v) => v.device === dev && new Date(v.at).getTime() > minuteAgo).length;
  const limit = db.settings.maxVotesPerMinute || 20;
  const flagged = recent >= limit ? `Burst: ${recent + 1} vote actions in 60s from one device` : undefined;
  const vote = db.add('votes', {
    eventId: event.id, categoryId: nominee.categoryId, nomineeId: nominee.id, qty, voter, channel, paymentId,
    round: event.rounds?.current ?? null, at: nowISO(), device: dev, flagged,
  });
  if (flagged) db.log('Votes flagged', `${event.title}: ${flagged}`, { eventId: event.id, companyId: event.companyId });
  return vote;
}

export function voidVotes(ids, reason) {
  const db = useDB.getState();
  ids.forEach((id) => db.update('votes', id, { void: true, voidReason: reason, flagged: undefined }));
  db.log('Votes voided', `${ids.length} vote record(s): ${reason}`);
}
