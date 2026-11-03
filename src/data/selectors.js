import { useMemo } from 'react';
import { useDB, useSession } from './store';
import { countableVotes } from '../lib/results';

export function useCurrentUser() {
  const id = useSession((s) => s.userId);
  const users = useDB((s) => s.users);
  return useMemo(() => users.find((u) => u.id === id) || null, [users, id]);
}

/** Events the user can manage: everything for admins, their company's for organisers, assigned ones for judges. */
export function scopeEvents(user, events) {
  if (!user) return [];
  if (user.role === 'admin') return events;
  if (user.role === 'judge') return events.filter((e) => (e.judgeIds || []).includes(user.id));
  return events.filter((e) => e.companyId === user.companyId);
}

export function useMyEvents() {
  const user = useCurrentUser();
  const events = useDB((s) => s.events);
  return useMemo(() => scopeEvents(user, events), [user, events]);
}

export const notificationsFor = (user, list) =>
  !user ? [] : list.filter((n) => n.userId === user.id || (n.toRole && n.toRole === user.role) || (n.companyId && user.role === 'organiser' && n.companyId === user.companyId));

/** Votes per nominee for the event's current round. */
export function useTally(event) {
  const votes = useDB((s) => s.votes);
  return useMemo(() => {
    if (!event) return {};
    const t = {};
    countableVotes(event, votes, event.rounds?.current ?? null).forEach((v) => (t[v.nomineeId] = (t[v.nomineeId] || 0) + v.qty));
    return t;
  }, [event, votes]);
}

