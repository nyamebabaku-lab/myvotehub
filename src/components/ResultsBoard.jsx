// Ranked results for one category: votes, public score, sealed/unsealed judge score and weighted final.
import { Crown, Lock } from 'lucide-react';
import { compactNum } from '../lib/format';
import { cx } from './ui';
import { NomineePhoto } from './event';

const medal = ['bg-amber-400 text-amber-950', 'bg-slate-200 text-slate-700', 'bg-orange-300 text-orange-900'];

export default function ResultsBoard({ event, res, showVotes = true, sealed = false, compact }) {
  const judges = res.withJudges;
  const top = Math.max(1, ...res.rows.map((r) => r.final));
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
        <div>
          <h3 className="font-extrabold text-slate-900 dark:text-white">{res.category.name}</h3>
          <p className="text-xs text-slate-500">{compactNum(res.totalVotes)} votes{judges ? ` · weighted ${event.publicWeight}% public / ${event.judgeWeight}% judges` : ''}</p>
        </div>
        {sealed && (
          <span className="chip bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15 dark:bg-violet-500/15 dark:text-violet-300"><Lock className="h-3 w-3" /> Judges sealed</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50/80 dark:bg-white/[.03]">
            <tr>
              <th className="th w-12">#</th>
              <th className="th">Nominee</th>
              {showVotes && <th className="th text-right">Votes</th>}
              {judges && <th className="th hidden text-right sm:table-cell">Public</th>}
              {judges && <th className="th hidden text-right sm:table-cell">Judges</th>}
              <th className="th w-[34%] min-w-[120px]">{judges ? 'Final score' : 'Share'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {res.rows.map((r) => (
              <tr key={r.nominee.id} className={cx(r.rank === 1 && 'bg-amber-50/60 dark:bg-amber-500/5', !r.competing && 'opacity-60')}>
                <td className="td">
                  {r.rank ? (
                    <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-black', medal[r.rank - 1] || 'bg-slate-100 text-slate-500 dark:bg-white/10')}>{r.rank}</span>
                  ) : (
                    <span className="text-[10px] font-black uppercase text-accent-600">Out</span>
                  )}
                </td>
                <td className="td">
                  <div className="flex items-center gap-3">
                    <NomineePhoto nominee={r.nominee} className={compact ? 'h-8 w-8' : 'h-10 w-10'} rounded="rounded-xl" text="text-xs" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-bold text-slate-800 dark:text-white">
                        {r.nominee.name} {r.rank === 1 && <Crown className="h-4 w-4 shrink-0 text-amber-500" />}
                      </p>
                      <p className="text-xs text-slate-400">{r.nominee.code}{r.nominee.status === 'evicted' && ' · evicted'}</p>
                    </div>
                  </div>
                </td>
                {showVotes && <td className="td text-right font-bold tabular-nums">{r.votes.toLocaleString()}</td>}
                {judges && <td className="td hidden text-right tabular-nums text-slate-500 sm:table-cell">{r.publicScore.toFixed(1)}</td>}
                {judges && (
                  <td className="td hidden text-right tabular-nums text-slate-500 sm:table-cell">
                    {r.judgeScore == null ? '—' : r.judgeScore.toFixed(1)}
                    <span className="block text-[10px] text-slate-400">{r.judgesIn}/{r.judgeCount} judges</span>
                  </td>
                )}
                <td className="td">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div className={cx('h-full rounded-full transition-all duration-700', r.rank === 1 ? 'bg-accent-600' : 'bg-brand-600')} style={{ width: `${judges ? (r.final / top) * 100 : r.share}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs font-bold tabular-nums">{judges ? r.final.toFixed(1) : `${r.share.toFixed(1)}%`}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
