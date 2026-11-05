// Single client-side data store. All reads/writes go through these actions.
// Demo build: seeded and saved in the browser. Live builds: an in-memory cache of Supabase (see sync.js);
// add/update/remove also write to the server.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MODE, LIVE, storeKey } from '../config';
import { buildSeed } from './seed';
import { DEFAULT_SETTINGS } from './constants';
import { uid, nowISO } from '../lib/format';
import { remoteAdd, remoteUpdate, remoteRemove, remoteSettings } from './sync';

export const DB_KEY = storeKey('myvotehub-db');

const PREFIX = {
  companies: 'co', users: 'usr', events: 'evt', categories: 'cat', nominees: 'nom', votes: 'vot', payments: 'pay',
  scores: 'scr', withdrawals: 'wd', evictions: 'evc', audit: 'aud', notifications: 'ntf',
};

const empty = () => ({
  settings: { ...DEFAULT_SETTINGS }, companies: [], users: [], events: [], categories: [], nominees: [], votes: [], payments: [],
  scores: [], evictions: [], withdrawals: [], audit: [], notifications: [],
  // Live voter screens: per-nominee totals and released judge averages from the server.
  pubVotes: [], pubScores: [], judgeProgress: {}, loaded: false, me: null,
});
// The demo seed is only bundled into the demo build (MODE is a build-time constant).
const initial = () => (MODE === 'demo' ? { ...empty(), ...buildSeed(), loaded: true } : empty());
const newId = (col) => (LIVE ? crypto.randomUUID() : uid(PREFIX[col] || 'id'));

// localStorage that reports a full device instead of failing silently.
let warned = 0;
const safeStorage = {
  getItem: (k) => localStorage.getItem(k),
  removeItem: (k) => localStorage.removeItem(k),
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      if (Date.now() - warned > 30000) {
        warned = Date.now();
        window.dispatchEvent(new CustomEvent('myvotehub-storage-full', { detail: e.name }));
      }
    }
  },
};

const session = () => useSession.getState().userId;

const actions = (set, get) => ({
  ...initial(),

  add: (col, obj) => {
    const rec = { id: newId(col), createdAt: nowISO(), ...obj };
    set((s) => ({ [col]: [...s[col], rec] }));
    if (LIVE) remoteAdd(col, rec);
    return rec;
  },
  addMany: (col, list) => {
    const recs = list.map((o) => ({ id: newId(col), createdAt: nowISO(), ...o }));
    set((s) => ({ [col]: [...s[col], ...recs] }));
    if (LIVE) recs.forEach((r) => remoteAdd(col, r));
    return recs;
  },
  update: (col, id, patch) => {
    const cur = get()[col].find((r) => r.id === id);
    const p = typeof patch === 'function' ? patch(cur) : patch;
    set((s) => ({ [col]: s[col].map((r) => (r.id === id ? { ...r, ...p } : r)) }));
    if (LIVE) remoteUpdate(col, id, p);
  },
  remove: (col, id) => {
    set((s) => ({ [col]: s[col].filter((r) => r.id !== id) }));
    if (LIVE) remoteRemove(col, id);
  },
  setSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    if (LIVE) remoteSettings(get().settings);
  },

  /** Appends to the audit trail (newest first, capped so storage stays small). */
  log: (action, detail, extra = {}) => {
    const rec = { id: newId('audit'), at: nowISO(), userId: session() || null, action, detail, ...extra };
    set((s) => ({ audit: [rec, ...s.audit].slice(0, 600) }));
    if (LIVE && session()) remoteAdd('audit', rec);
  },
  notify: (n) => {
    const rec = { id: newId('notifications'), at: nowISO(), read: false, ...n };
    set((s) => ({ notifications: [rec, ...s.notifications].slice(0, 300) }));
    if (LIVE && session()) remoteAdd('notifications', rec);
  },
  markRead: (ids) => {
    set((s) => ({ notifications: s.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) }));
    if (LIVE) ids.forEach((id) => remoteUpdate('notifications', id, { read: true }));
  },

  /** Removes an event and everything that hangs off it. */
  deleteEvent: (id) => {
    set((s) => ({
      events: s.events.filter((e) => e.id !== id),
      categories: s.categories.filter((c) => c.eventId !== id),
      nominees: s.nominees.filter((n) => n.eventId !== id),
      votes: s.votes.filter((v) => v.eventId !== id),
      scores: s.scores.filter((v) => v.eventId !== id),
      evictions: s.evictions.filter((v) => v.eventId !== id),
    }));
    if (LIVE) remoteRemove('events', id);
  },

  resetDemo: () => set({ ...initial() }),
  /** Live builds: forget everything private (on sign-out). */
  clearPrivate: () => set({ users: [], payments: [], votes: [], withdrawals: [], audit: [], notifications: [], scores: [], judgeProgress: {} }),
  get,
});

const fnFree = (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function'));

// Live data is never written to the browser, so nothing private is left on a shared phone after sign-out.
export const useDB = LIVE
  ? create(actions)
  : create(persist(actions, { name: DB_KEY, version: 1, storage: createJSONStorage(() => safeStorage), partialize: fnFree }));

export const useSession = create(
  persist(
    (set) => ({
      userId: null,
      dark: false,
      sidebarCollapsed: false,
      voter: '', // phone number the public voter last verified
      voterCode: '', // live builds: the verified free-vote code, reused for 30 minutes
      login: (userId) => set({ userId }),
      logout: () => set({ userId: null }),
      toggleDark: () => set((s) => ({ dark: !s.dark })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setVoter: (voter, voterCode = '') => set({ voter, voterCode }),
    }),
    { name: storeKey('myvotehub-session') },
  ),
);

/** Votes and judge scores as voters may see them: server totals in live builds, raw records in the demo. */
export const publicVotes = (s) => (LIVE ? s.pubVotes : s.votes);
export const publicScores = (s) => (LIVE ? s.pubScores : s.scores);

if (!LIVE && typeof window !== 'undefined') {
  // Another tab (e.g. a big-screen reveal) sees votes as soon as they land.
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) useDB.persist.rehydrate();
  });
  // Save the demo seed on first visit so its timestamps stay fixed across reloads.
  try {
    if (!localStorage.getItem(DB_KEY)) useDB.setState({});
  } catch {
    /* storage blocked: the app still runs from memory */
  }
}
