// Results engine: public votes and judges' secret scores, each normalised to 0–100,
// then combined with the event's weighting.
//   publicScore = votes / top votes in category × 100
//   judgeScore  = average of each judge's total ÷ max possible × 100
//   final       = (publicScore × publicWeight + judgeScore × judgeWeight) / 100
// Ties break on judge score, then raw votes.

export const maxScore = (event) => (event.criteria || []).reduce((a, c) => a + Number(c.max || 0), 0);
export const usesJudges = (event) => event.judgeWeight > 0 && maxScore(event) > 0;

/** Votes that count for a round: carry-over events add earlier rounds, others count only that round. */
export function countableVotes(event, votes, round) {
  const live = votes.filter((v) => v.eventId === event.id && !v.void);
  if (!event.rounds || round == null) return live;
  return live.filter((v) => (event.rounds.carryOver ? (v.round ?? 1) <= round : (v.round ?? 1) === round));
}

/** Nominees still competing in a round (evicted ones drop out after the round they left). */
export const inRound = (nominee, round) => nominee.status !== 'evicted' || round == null || nominee.evictedRound >= round;

/**
 * Rows for one category, ranked.
 * opts.withJudges — false hides judge data (sealed); defaults to the event's release state.
 */
export function categoryResults(event, category, { nominees, votes, scores }, opts = {}) {
  const round = opts.round ?? event.rounds?.current ?? null;
  const withJudges = (opts.withJudges ?? event.resultsReleased) && usesJudges(event);
  const noms = nominees.filter((n) => n.categoryId === category.id);
  const vs = countableVotes(event, votes, round).filter((v) => v.categoryId === category.id);
  const tally = {};
  vs.forEach((v) => (tally[v.nomineeId] = (tally[v.nomineeId] || 0) + v.qty));
  const competing = noms.filter((n) => inRound(n, round));
  const top = Math.max(0, ...competing.map((n) => tally[n.id] || 0));
  const total = noms.reduce((a, n) => a + (tally[n.id] || 0), 0);
  const max = maxScore(event);
  const judgeCount = (event.judgeIds || []).length;

  const rows = noms.map((n) => {
    const votesN = tally[n.id] || 0;
    const mine = scores.filter((s) => s.nomineeId === n.id && s.eventId === event.id && s.submitted);
    const judgeAvg = mine.length ? mine.reduce((a, s) => a + s.total, 0) / mine.length : null;
    const publicScore = top ? (votesN / top) * 100 : 0;
    const judgeScore = judgeAvg != null && max ? (judgeAvg / max) * 100 : null;
    const final = withJudges ? (publicScore * event.publicWeight + (judgeScore ?? 0) * event.judgeWeight) / 100 : publicScore;
    return {
      nominee: n,
      votes: votesN,
      share: total ? (votesN / total) * 100 : 0,
      publicScore,
      judgeAvg: withJudges ? judgeAvg : null,
      judgeScore: withJudges ? judgeScore : null,
      judgesIn: mine.length,
      judgeCount,
      final,
      competing: inRound(n, round),
    };
  });
  rows.sort((a, b) => b.competing - a.competing || b.final - a.final || (b.judgeScore ?? 0) - (a.judgeScore ?? 0) || b.votes - a.votes);
  let rank = 0;
  rows.forEach((row) => (row.rank = row.competing ? ++rank : null));
  return { category, rows, totalVotes: total, withJudges };
}

export function eventResults(event, db, opts) {
  const cats = db.categories.filter((c) => c.eventId === event.id).sort((a, b) => a.order - b.order);
  const list = cats.map((c) => categoryResults(event, c, db, opts));
  const grandTotal = db.votes.filter((v) => v.eventId === event.id && !v.void).reduce((a, v) => a + v.qty, 0);
  return { categories: list, grandTotal };
}

/** Judge progress: how many nominees each judge has submitted, never the values. */
export function judgeProgress(event, { nominees, scores, users }) {
  const noms = nominees.filter((n) => n.eventId === event.id && n.status !== 'evicted');
  return (event.judgeIds || []).map((jid) => {
    const mine = scores.filter((s) => s.eventId === event.id && s.judgeId === jid);
    return {
      judge: users.find((u) => u.id === jid),
      submitted: mine.filter((s) => s.submitted).length,
      drafts: mine.filter((s) => !s.submitted).length,
      total: noms.length,
    };
  });
}
