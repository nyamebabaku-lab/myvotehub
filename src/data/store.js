// Single client-side data store. All reads/writes go through these actions,
// so swapping localStorage for a cloud backend later only touches this file.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { buildSeed } from './seed';
import { uid, nowISO } from '../lib/format';

export const DB_KEY = 'myvotehub-db';

const PREFIX = {
  companies: 'co', users: 'usr', events: 'evt', categories: 'cat', nominees: 'nom', votes: 'vot', payments: 'pay',
  scores: 'scr', withdrawals: 'wd', evictions: 'evc', audit: 'aud', notifications: 'ntf',
};

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

export const useDB = create(
  persist(
    (set, get) => ({
      ...buildSeed(),

      add: (col, obj) => {
        const rec = { id: uid(PREFIX[col] || 'id'), createdAt: nowISO(), ...obj };
        set((s) => ({ [col]: [...s[col], rec] }));
        return rec;
      },
      addMany: (col, list) => {
        const recs = list.map((o) => ({ id: uid(PREFIX[col] || 'id'), createdAt: nowISO(), ...o }));
        set((s) => ({ [col]: [...s[col], ...recs] }));
        return recs;
      },
      update: (col, id, patch) =>
        set((s) => ({ [col]: s[col].map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)) })),
      remove: (col, id) => set((s) => ({ [col]: s[col].filter((r) => r.id !== id) })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      /** Appends to the audit trail (newest first, capped so storage stays small). */
      log: (action, detail, extra = {}) =>
        set((s) => ({ audit: [{ id: uid('aud'), at: nowISO(), userId: session() || null, action, detail, ...extra }, ...s.audit].slice(0, 600) })),
      notify: (n) => set((s) => ({ notifications: [{ id: uid('ntf'), at: nowISO(), read: false, ...n }, ...s.notifications].slice(0, 300) })),
      markRead: (ids) => set((s) => ({ notifications: s.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) })),

      /** Removes an event and everything that hangs off it. */
      deleteEvent: (id) =>
        set((s) => ({
          events: s.events.filter((e) => e.id !== id),
          categories: s.categories.filter((c) => c.eventId !== id),
          nominees: s.nominees.filter((n) => n.eventId !== id),
          votes: s.votes.filter((v) => v.eventId !== id),
          scores: s.scores.filter((v) => v.eventId !== id),
          evictions: s.evictions.filter((v) => v.eventId !== id),
        })),

      resetDemo: () => set({ ...buildSeed() }),
      get,
    }),
    {
      name: DB_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function')),
    },
  ),
);

export const useSession = create(
  persist(
    (set) => ({
      userId: null,
      dark: false,
      sidebarCollapsed: false,
      voter: '', // phone number the public voter last verified
      login: (userId) => set({ userId }),
      logout: () => set({ userId: null }),
      toggleDark: () => set((s) => ({ dark: !s.dark })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setVoter: (voter) => set({ voter }),
    }),
    { name: 'myvotehub-session' },
  ),
);

// Another tab (e.g. a big-screen reveal) sees votes as soon as they land.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) useDB.persist.rehydrate();
  });
}

// Save the demo seed on first visit so its timestamps stay fixed across reloads.
try {
  if (typeof window !== 'undefined' && !localStorage.getItem(DB_KEY)) useDB.setState({});
} catch {
  /* storage blocked: the app still runs from memory */
}
