import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, EyeOff, MonitorPlay, Trophy } from 'lucide-react';
import { useDB, publicVotes, publicScores } from '../../data/store';
import { LIVE } from '../../config';
import { eventResults, usesJudges } from '../../lib/results';
import { isPublic } from '../../lib/voting';
import { compactNum, fmtDate } from '../../lib/format';
import { Button, EmptyState, Tabs } from '../../components/ui';
import { PhaseBadge } from '../../components/event';
import ResultsBoard from '../../components/ResultsBoard';

export default function PublicResults() {
  const { eventId } = useParams();
  const raw = useDB();
  const db = useMemo(() => ({ ...raw, votes: publicVotes(raw), scores: publicScores(raw) }), [raw]);
  const event = db.events.find((e) => e.id === eventId);
  const [round, setRound] = useState(event?.rounds?.current ?? null);
  const res = useMemo(() => event && eventResults(event, db, { round, withJudges: event.resultsReleased }), [event, db, round]);
  if (!event || !isPublic(event)) return <EmptyState title="Event not found" />;

  const hidden = !event.showLeaderboard && !event.resultsReleased;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link to={`/e/${event.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to voting
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PhaseBadge event={event} />
            {event.resultsReleased && <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Official results · {fmtDate(event.releasedAt)}</span>}
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{event.resultsReleased ? 'Final results' : 'Live leaderboard'}</h1>
          <p className="text-slate-500">
            {event.title} · {compactNum(res.grandTotal)} total votes
          </p>
        </div>
        <Link to={`/reveal/${event.id}`}>
          <Button variant="soft" icon={MonitorPlay}>Big-screen mode</Button>
        </Link>
      </div>
      {event.rounds && !LIVE && (
        <Tabs className="mt-5" value={round} onChange={setRound} tabs={event.rounds.list.map((r) => ({ value: r.n, label: r.label + (r.n === event.rounds.current ? ' (now)' : '') }))} />
      )}
      {!event.resultsReleased && usesJudges(event) && !hidden && (
        <p className="mt-5 rounded-2xl bg-violet-50 p-4 text-sm text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">
          This leaderboard shows public votes only. Judges’ scores ({event.judgeWeight}% of the final result) stay sealed until the organiser announces the winners.
        </p>
      )}
      {hidden ? (
        <div className="card mt-6">
          <EmptyState icon={EyeOff} title="Results are hidden" text="The organiser keeps the leaderboard private until the winners are announced. Keep voting!" />
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {res.categories.map((c) => (
            <ResultsBoard key={c.category.id} event={event} res={c} showVotes={event.showCounts} />
          ))}
          {!res.categories.length && <EmptyState icon={Trophy} title="No categories yet" />}
        </div>
      )}
    </div>
  );
}
