// Live builds: keeps the in-memory store in step with Supabase.
// Reads: everything the signed-in user may see (row-level security decides), plus public tallies for voters.
// Writes: the store's add/update/remove call these, in order, so related rows (event → categories → nominees) land in sequence.
import { supabase, must } from '../lib/supabase';
import { useDB } from './store';
import { TABLES, toRow, fromRow, settingsFromRow, settingsToRow } from './mapping';
import { toast } from '../components/ui';

let profile = null; // signed-in profile, or null for public visitors
let channel = null;
let pollTimer = null;
let queue = Promise.resolve();

const set = (patch) => useDB.setState(patch);
const select = async (table, q = (x) => x) => must(await q(supabase.from(table).select('*')));
const rows = (col, list) => list.map((r) => fromRow(col, r));

// ---------------------------------------------------------------- reads
/** Votes for voter screens, summed per nominee on the server (no voter details leave the database). */
async function loadTallies() {
  const [tally, released] = await Promise.all([must(await supabase.rpc('public_tallies')), must(await supabase.rpc('released_scores'))]);
  const events = useDB.getState().events;
  const now = new Date().toISOString();
  const pubVotes = tally.map((t) => ({ id: `t_${t.nominee_id}`, eventId: t.event_id, categoryId: t.category_id, nomineeId: t.nominee_id, qty: Number(t.votes), round: events.find((e) => e.id === t.event_id)?.rounds?.current ?? null, at: now }));
  // One stand-in score per judge that submitted, each holding the average, so results.js computes the same weighted final.
  const pubScores = released.flatMap((s) => Array.from({ length: s.judges_in }, (_, i) => ({ id: `s_${s.nominee_id}_${i}`, eventId: s.event_id, nomineeId: s.nominee_id, judgeId: `judge_${i}`, total: Number(s.judge_avg), submitted: true })));
  set({ pubVotes, pubScores });
  return pubScores;
}

async function loadCatalogue() {
  const [settings, companies, events, categories, nominees, evictions, panels] = await Promise.all([
    select('settings'), select('companies'), select('events'), select('categories'), select('nominees'), select('evictions'),
    profile ? select('event_judges') : Promise.resolve([]),
  ]);
  const judges = {};
  panels.forEach((p) => (judges[p.event_id] ||= []).push(p.judge_id));
  set({
    settings: { ...useDB.getState().settings, ...(settings[0] ? settingsFromRow(settings[0]) : {}) },
    companies: rows('companies', companies),
    events: rows('events', events).map((e) => ({ ...e, judgeIds: judges[e.id] || [] })),
    categories: rows('categories', categories),
    nominees: rows('nominees', nominees),
    evictions: rows('evictions', evictions).map((x) => ({ ...x, categoryId: nominees.find((n) => n.id === x.nomineeId)?.category_id })),
  });
}

async function loadPrivate() {
  if (!profile) return;
  const role = profile.role;
  const [users, payments, votes, withdrawals, audit, notifications, scores] = await Promise.all([
    select('profiles'),
    role === 'judge' ? [] : select('payments'),
    role === 'judge' ? [] : select('votes'),
    role === 'judge' ? [] : select('withdrawals'),
    role === 'judge' ? [] : select('audit_log', (q) => q.order('at', { ascending: false }).limit(600)),
    select('notifications', (q) => q.order('at', { ascending: false }).limit(300)),
    role === 'organiser' ? [] : select('scores'),
  ]);
  const nominees = useDB.getState().nominees;
  const patch = {
    users: rows('users', users),
    payments: rows('payments', payments),
    votes: rows('votes', votes),
    withdrawals: rows('withdrawals', withdrawals),
    audit: rows('audit', audit),
    notifications: rows('notifications', notifications),
  };
  // Organisers never receive raw judge scores: they get released averages (sealed events give nothing).
  patch.scores = role === 'organiser' ? useDB.getState().pubScores : rows('scores', scores).map((s) => ({ ...s, categoryId: nominees.find((n) => n.id === s.nomineeId)?.categoryId }));
  if (role !== 'judge') {
    const managed = useDB.getState().events.filter((e) => e.judgeIds?.length);
    const progress = {};
    await Promise.all(managed.map(async (e) => (progress[e.id] = must(await supabase.rpc('judge_progress', { eid: e.id })) || [])));
    patch.judgeProgress = progress;
  }
  set(patch);
}

/** Reloads everything the current user may see. */
export async function refresh() {
  if (!supabase) return;
  try {
    await loadCatalogue();
    await loadTallies();
    await loadPrivate();
  } catch (e) {
    console.warn('sync', e);
  }
}

let pending = null;
export const refreshSoon = () => {
  clearTimeout(pending);
  pending = setTimeout(refresh, 600);
};

/** Starts syncing for a signed-in profile (or a public visitor when profile is null). */
export async function startSync(p) {
  profile = p;
  await refresh();
  stopRealtime();
  // Voter screens: live counts every 5 seconds. Signed-in users also get pushed changes.
  pollTimer = setInterval(() => loadTallies().catch(() => {}), 5000);
  if (profile) {
    channel = supabase.channel(`mvh-${profile.id}`);
    for (const t of ['votes', 'events', 'nominees', 'categories', 'evictions', 'withdrawals', 'notifications', 'payments', 'profiles', 'companies']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, refreshSoon);
    }
    channel.subscribe();
  }
}

function stopRealtime() {
  clearInterval(pollTimer);
  if (channel) supabase.removeChannel(channel);
  channel = null;
}

export function stopSync() {
  stopRealtime();
  profile = null;
}

// ---------------------------------------------------------------- writes
function enqueue(fn) {
  queue = queue.then(fn).catch((e) => {
    toast.error('Could not save', e.message);
    refreshSoon();
  });
  return queue;
}

async function syncPanel(eventId, judgeIds) {
  const current = must(await supabase.from('event_judges').select('judge_id').eq('event_id', eventId)).map((r) => r.judge_id);
  const add = judgeIds.filter((j) => !current.includes(j));
  const drop = current.filter((j) => !judgeIds.includes(j));
  if (add.length) must(await supabase.from('event_judges').insert(add.map((judge_id) => ({ event_id: eventId, judge_id }))));
  if (drop.length) must(await supabase.from('event_judges').delete().eq('event_id', eventId).in('judge_id', drop));
}

export function remoteAdd(col, rec) {
  if (!TABLES[col]) return;
  enqueue(async () => {
    const row = toRow(col, rec);
    if (col === 'audit') row.user_id = profile?.id;
    must(await supabase.from(TABLES[col].table).insert(row));
    if (col === 'events' && rec.judgeIds?.length) await syncPanel(rec.id, rec.judgeIds);
  });
}

export function remoteUpdate(col, id, patch) {
  if (!TABLES[col]) return;
  enqueue(async () => {
    const row = toRow(col, patch);
    delete row.id;
    if (Object.keys(row).length) must(await supabase.from(TABLES[col].table).update(row).eq('id', id));
    if (col === 'events' && patch.judgeIds) await syncPanel(id, patch.judgeIds);
  });
}

export function remoteRemove(col, id) {
  if (!TABLES[col]) return;
  enqueue(async () => must(await supabase.from(TABLES[col].table).delete().eq('id', id)));
}

export function remoteSettings(s) {
  enqueue(async () => must(await supabase.from('settings').update(settingsToRow(s)).eq('id', true)));
}

/** Waits for every queued write (used before navigating away after a multi-step save). */
export const flushWrites = () => queue;
