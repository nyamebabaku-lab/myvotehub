import { Lock, Unlock, Gavel, CheckCircle2, EyeOff } from 'lucide-react';
import { useDB } from '../../../data/store';
import { LIVE } from '../../../config';
import { judgeProgress, maxScore } from '../../../lib/results';
import { releaseResults, withdrawResults } from '../../../lib/events';
import { Avatar, Badge, Button, Card, CardHeader, Progress, confirmDialog, toast } from '../../../components/ui';

export default function Judges({ event }) {
  const db = useDB();
  const noms0 = db.nominees.filter((n) => n.eventId === event.id && n.status !== 'evicted').length;
  // Live: organisers get submission counts from the server, never the scores themselves.
  const progress = LIVE
    ? (db.judgeProgress[event.id] || []).map((p) => ({ judge: db.users.find((u) => u.id === p.judge_id) || { id: p.judge_id, name: p.name }, submitted: p.submitted, drafts: p.drafts, total: noms0 }))
    : judgeProgress(event, db);
  const panel = db.users.filter((u) => u.role === 'judge' && u.companyId === event.companyId && (!LIVE || u.status === 'active'));
  const allDone = progress.every((p) => p.submitted >= p.total);
  const noms = db.nominees.filter((n) => n.eventId === event.id);
  const toggleJudge = (id) => db.update('events', event.id, { judgeIds: event.judgeIds.includes(id) ? event.judgeIds.filter((x) => x !== id) : [...event.judgeIds, id] });

  const release = async () => {
    const text = allDone ? 'Judges’ scores will be unsealed and the weighted final results published on the public leaderboard.' : 'Some judges have not finished. Missing scores count as zero for those nominees. Publish anyway?';
    if (!(await confirmDialog('Release results?', text, { danger: !allDone, confirmLabel: 'Release results' }))) return;
    releaseResults(event);
    toast.success('Results released', 'Final results are now public');
  };

  return (
    <div className="space-y-6">
      <Card className={event.resultsReleased ? 'border-emerald-200 dark:border-emerald-500/20' : 'border-violet-200 dark:border-violet-500/20'}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${event.resultsReleased ? 'bg-emerald-500' : 'bg-violet-600'} text-white`}>
            {event.resultsReleased ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <p className="font-extrabold text-slate-900 dark:text-white">{event.resultsReleased ? 'Scores unsealed — results are public' : 'Judges’ scores are sealed'}</p>
            <p className="text-sm text-slate-500">
              {event.resultsReleased
                ? 'Everyone can now see the weighted final results.'
                : `Nobody — including you — can see individual scores until you release results. Judges count for ${event.judgeWeight}% of the final result.`}
            </p>
          </div>
          {event.resultsReleased ? (
            <Button variant="secondary" icon={EyeOff} onClick={() => withdrawResults(event)}>Hide results</Button>
          ) : (
            <Button variant="danger" icon={Unlock} onClick={release}>Release results</Button>
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Judging progress" subtitle={`${progress.length} judges · ${noms.length} nominees`} icon={Gavel} />
          <div className="space-y-4 p-5 pt-3">
            {progress.map((p) => (
              <div key={p.judge?.id} className="flex items-center gap-3">
                <Avatar name={p.judge?.name || '?'} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate font-bold text-slate-800 dark:text-white">{p.judge?.name}</span>
                    <span className="text-xs text-slate-500">{p.submitted}/{p.total} submitted{p.drafts ? ` · ${p.drafts} draft` : ''}</span>
                  </div>
                  <Progress className="mt-1.5" value={(p.submitted / Math.max(1, p.total)) * 100} tone={p.submitted >= p.total ? 'green' : 'blue'} />
                </div>
                {p.submitted >= p.total && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
              </div>
            ))}
            {!progress.length && <p className="text-sm text-slate-400">No judges on this panel yet.</p>}
          </div>
          {event.resultsReleased && progress.length > 0 && (!LIVE || db.scores.some((x) => x.eventId === event.id && !x.judgeId?.startsWith('judge_'))) && (
            <div className="overflow-x-auto border-t border-slate-100 dark:border-white/5">
              <table className="w-full">
                <thead className="bg-slate-50/80 dark:bg-white/[.03]">
                  <tr>
                    <th className="th">Nominee</th>
                    {progress.map((p) => <th key={p.judge.id} className="th text-right">{p.judge.name.split(' ').slice(-1)[0]}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {noms.map((n) => (
                    <tr key={n.id}>
                      <td className="td font-semibold">{n.name}</td>
                      {progress.map((p) => {
                        const s = db.scores.find((x) => x.judgeId === p.judge.id && x.nomineeId === n.id && x.submitted);
                        return <td key={p.judge.id} className="td text-right tabular-nums">{s ? `${s.total}/${maxScore(event)}` : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Criteria" subtitle={`Max ${maxScore(event)} points per judge`} />
            <div className="space-y-2 p-5 pt-3">
              {event.criteria.map((c) => (
                <div key={c.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-slate-500">/{c.max}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Panel" subtitle="Your company’s judges" />
            <div className="space-y-2 p-5 pt-3">
              {panel.map((j) => (
                <label key={j.id} className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={event.judgeIds.includes(j.id)} onChange={() => toggleJudge(j.id)} disabled={event.resultsReleased} />
                  <span className="flex-1 font-semibold">{j.name}</span>
                  {event.judgeIds.includes(j.id) && <Badge tone="violet">On panel</Badge>}
                </label>
              ))}
              {!panel.length && <p className="text-sm text-slate-400">Invite judges from Team &amp; judges.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
