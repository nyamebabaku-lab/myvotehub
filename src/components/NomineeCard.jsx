import { Link } from 'react-router-dom';
import { compactNum } from '../lib/format';
import { eventPhase } from '../lib/voting';
import { Button, cx } from './ui';
import { NomineePhoto } from './event';

export default function NomineeCard({ event, nominee, votes, share, onVote, rank }) {
  const live = eventPhase(event) === 'live';
  const evicted = nominee.status === 'evicted';
  return (
    <div className={cx('card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift', evicted && 'opacity-75')}>
      <Link to={`/e/${event.id}/n/${nominee.id}`} className="relative block">
        <NomineePhoto nominee={nominee} className="aspect-square w-full" rounded="rounded-none" text="text-4xl" />
        {rank && rank <= 3 && !evicted && event.showLeaderboard && (
          <span className={cx('absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shadow', rank === 1 ? 'bg-amber-400 text-amber-950' : rank === 2 ? 'bg-slate-200 text-slate-700' : 'bg-orange-300 text-orange-900')}>{rank}</span>
        )}
        <span className="absolute bottom-2 right-2 rounded-lg bg-black/40 px-2 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur">{nominee.code}</span>
      </Link>
      <div className="flex flex-1 flex-col p-3">
        <Link to={`/e/${event.id}/n/${nominee.id}`} className="line-clamp-2 text-sm font-extrabold leading-snug text-slate-900 hover:text-brand-700 dark:text-white">
          {nominee.name}
        </Link>
        {event.showCounts && !evicted && (
          <div className="mt-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{compactNum(votes)} votes</span>
              <span className="text-slate-400">{share.toFixed(1)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700" style={{ width: `${share}%` }} />
            </div>
          </div>
        )}
        {evicted ? (
          <p className="mt-auto pt-3 text-xs font-bold text-accent-600">Evicted · {event.rounds?.list.find((r) => r.n === nominee.evictedRound)?.label || 'earlier'}</p>
        ) : (
          <div className="mt-auto pt-3">
            <Button variant={live ? 'danger' : 'secondary'} size="sm" className="w-full" disabled={!live} onClick={() => onVote(nominee)}>
              {live ? (event.votingMode === 'free' ? 'Vote free' : 'Vote') : eventPhase(event) === 'upcoming' ? 'Opens soon' : 'Closed'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

