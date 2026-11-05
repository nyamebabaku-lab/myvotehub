// Store collections ↔ Supabase tables. Field names are camelCase in the app and snake_case in the database;
// `rename` covers the few that differ, `skip` lists app-only fields that are never written.
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export const TABLES = {
  companies: { table: 'companies', rename: { logo: 'logo_url' }, fields: ['name', 'industry', 'email', 'phone', 'city', 'logo', 'brandColor', 'kyc', 'kycDocs', 'status', 'commissionPct', 'payout', 'statusReason'] },
  users: { table: 'profiles', fields: ['name', 'title', 'phone'] },
  events: {
    table: 'events',
    rename: { image: 'image_url' },
    fields: ['companyId', 'title', 'type', 'tagline', 'description', 'venue', 'cover', 'image', 'startAt', 'endAt', 'status', 'reviewNote', 'submittedAt', 'reviewedAt', 'votingMode', 'pricePerVote', 'bundles', 'freeVotesPerVoter', 'freePeriod', 'publicWeight', 'judgeWeight', 'criteria', 'showLeaderboard', 'showCounts', 'rounds', 'resultsReleased', 'releasedAt'],
  },
  categories: { table: 'categories', rename: { order: 'sort' }, fields: ['eventId', 'name', 'code', 'description', 'order'] },
  nominees: { table: 'nominees', rename: { photo: 'photo_url' }, fields: ['eventId', 'categoryId', 'name', 'code', 'bio', 'photo', 'status', 'evictedRound'] },
  votes: { table: 'votes', rename: { at: 'created_at' }, fields: ['void', 'voidReason', 'flagged'] },
  payments: { table: 'payments', rename: { at: 'created_at' }, fields: [] },
  withdrawals: { table: 'withdrawals', fields: [] },
  scores: { table: 'scores', rename: { at: 'updated_at' }, fields: ['eventId', 'judgeId', 'nomineeId', 'scores', 'total', 'comment', 'submitted', 'at'] },
  evictions: { table: 'evictions', rename: { at: 'created_at' }, fields: ['eventId', 'nomineeId', 'round', 'mode', 'reason', 'by'] },
  audit: { table: 'audit_log', fields: ['userId', 'companyId', 'eventId', 'action', 'detail'] },
  notifications: { table: 'notifications', rename: { text: 'body' }, fields: ['toRole', 'userId', 'companyId', 'title', 'text', 'link', 'read'] },
};

/** App record → database row (only writable fields). */
export function toRow(col, rec) {
  const t = TABLES[col];
  const row = {};
  for (const k of t.fields) if (k in rec) row[t.rename?.[k] || snake(k)] = rec[k] === undefined ? null : rec[k];
  if (rec.id) row.id = rec.id;
  return row;
}

/** Database row → app record. */
export function fromRow(col, row) {
  const t = TABLES[col];
  const back = Object.fromEntries(Object.entries(t.rename || {}).map(([a, b]) => [b, a]));
  const rec = {};
  for (const [k, v] of Object.entries(row)) rec[back[k] || camel(k)] = v === null ? undefined : v;
  if (col === 'payments' || col === 'withdrawals') for (const k of ['amount', 'fee', 'commission', 'net', 'commissionPct']) if (rec[k] != null) rec[k] = Number(rec[k]);
  if (col === 'companies' && rec.commissionPct != null) rec.commissionPct = Number(rec.commissionPct);
  if (col === 'events' && rec.pricePerVote != null) rec.pricePerVote = Number(rec.pricePerVote);
  if (col === 'scores' && rec.total != null) rec.total = Number(rec.total);
  if (col === 'withdrawals') rec.requestedAt ||= rec.createdAt;
  if (!rec.createdAt && row.created_at) rec.createdAt = row.created_at;
  return rec;
}

export const settingsFromRow = (r) => ({
  platformName: r.platform_name, currency: r.currency, defaultCommission: Number(r.default_commission), minWithdrawal: Number(r.min_withdrawal),
  requireEventApproval: r.require_event_approval, maxVotesPerMinute: r.max_votes_per_minute, supportEmail: r.support_email, supportPhone: r.support_phone,
  testMode: r.test_mode, reservedAdminEmail: r.reserved_admin_email,
});
export const settingsToRow = (s) => ({
  platform_name: s.platformName, currency: s.currency, default_commission: s.defaultCommission, min_withdrawal: s.minWithdrawal,
  require_event_approval: s.requireEventApproval, max_votes_per_minute: s.maxVotesPerMinute, support_email: s.supportEmail, support_phone: s.supportPhone,
});
