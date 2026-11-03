// A judge's private scoring sheet. Scores autosave as drafts; submitting a category locks it.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, Send, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { maxScore } from '../../lib/results';
import { nowISO } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Progress, Textarea, confirmDialog, cx, toast } from '../../components/ui';
import { NomineePhoto } from '../../components/event';

export default function ScoreSheet() {
  const { eventId } = useParams();
  const user = useCurrentUser();
  const db = useDB();
  const event = db.events.find((e) => e.id === eventId);
  const cats = db.categories.filter((c) => c.eventId === eventId).sort((a, b) => a.order - b.order);
  const [catId, setCatId] = useState(cats[0]?.id);
  if (!event || !event.judgeIds.includes(user.id)) return <EmptyState title="You are not on this judging panel" />;

  const max = maxScore(event);
  const mine = db.scores.filter((s) => s.eventId === eventId && s.judgeId === user.id);
  const scoreOf = (nid) => mine.find((s) => s.nomineeId === nid);
  const noms = db.nominees.filter((n) => n.categoryId === catId && n.status !== 'evicted');
  const locked = event.resultsReleased;

  const setScore = (nom, critId, value) => {
    const cur = scoreOf(nom.id);
    if (cur?.submitted || locked) return;
    const scores = { ...(cur?.scores || {}), [critId]: value };
    const total = Object.values(scores).reduce((a, x) => a + x, 0);
    if (cur) db.update('scores', cur.id, { scores, total, at: nowISO() });
    else db.add('scores', { eventId, judgeId: user.id, nomineeId: nom.id, categoryId: nom.categoryId, scores, total, comment: '', submitted: false, at: nowISO() });
  };
  const setComment = (nom, comment) => {
    const cur = scoreOf(nom.id);
    if (cur && !cur.submitted) db.update('scores', cur.id, { comment });
  };
  const complete = (nom) => {
    const s = scoreOf(nom.id);
    return s && event.criteria.every((c) => s.scores[c.id] != null);
  };
  const submitCategory = async () => {
    const missing = noms.filter((n) => !complete(n));
    if (missing.length) return toast.error(`${missing.length} nominee(s) not fully scored`, missing.map((n) => n.name).slice(0, 3).join(', '));
    if (!(await confirmDialog('Submit and lock these scores?', 'You cannot change them after submitting. Your scores stay secret until the organiser releases results.', { danger: false, confirmLabel: 'Submit scores' }))) return;
    noms.forEach((n) => db.update('scores', scoreOf(n.id).id, { submitted: true, at: nowISO() }));
    db.log('Judge submitted scores', `${user.name} — ${cats.find((c) => c.id === catId)?.name} (${event.title})`, { eventId, companyId: event.companyId });
    toast.success('Scores submitted', 'Thank you!');
  };
  const catDone = (cid) => {
    const list = db.nominees.filter((n) => n.categoryId === cid && n.status !== 'evicted');
    return list.length > 0 && list.every((n) => scoreOf(n.id)?.submitted);
  };
  const doneHere = noms.filter((n) => scoreOf(n.id)?.submitted).length;

  return (
    <>
      <Link to="/app/judging" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> My events</Link>
      <PageHeader title={event.title} subtitle={`Score each nominee out of ${max}. Judges count for ${event.judgeWeight}% of the final result.`} actions={!catDone(catId) && !locked && <Button variant="danger" icon={Send} onClick={submitCategory}>Submit category</Button>} />
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p>Your scores are <b>secret</b>. Other judges, the organiser and the public cannot see them — and you cannot see public vote counts — until the organiser releases the results.</p>
      </div>
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
        {cats.map((c) => (
          <button key={c.id} onClick={() => setCatId(c.id)} className={cx('flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ring-1 transition', catId === c.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10')}>
            {catDone(c.id) && <CheckCircle2 className="h-4 w-4" />} {c.name}
          </button>
        ))}
      </div>
      <div className="mb-5 flex items-center gap-3">
        <Progress value={(doneHere / Math.max(1, noms.length)) * 100} tone={doneHere === noms.length ? 'green' : 'blue'} />
        <span className="whitespace-nowrap text-xs font-bold text-slate-500">{noms.filter(complete).length}/{noms.length} scored · {doneHere} submitted</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {noms.map((n) => {
          const s = scoreOf(n.id);
          const ro = s?.submitted || locked;
          return (
            <Card key={n.id} className={cx('p-5', ro && 'bg-slate-50/60 dark:bg-white/[.02]')}>
              <div className="flex items-center gap-4">
                <NomineePhoto nominee={n} className="h-14 w-14" text="text-base" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold text-slate-900 dark:text-white">{n.name}</p>
                  <p className="font-mono text-xs text-slate-400">{n.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-extrabold tabular-nums text-brand-700 dark:text-brand-300">{s?.total ?? 0}<span className="text-sm text-slate-400">/{max}</span></p>
                  {s?.submitted ? <Badge tone="green"><Lock className="h-3 w-3" /> Submitted</Badge> : complete(n) ? <Badge tone="blue">Draft saved</Badge> : <Badge tone="slate">Not scored</Badge>}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {event.criteria.map((c) => {
                  const v = s?.scores?.[c.id];
                  return (
                    <div key={c.id}>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{c.name}</span>
                        <span className="font-bold tabular-nums">{v ?? '–'} / {c.max}</span>
                      </div>
                      <input type="range" min={0} max={c.max} value={v ?? 0} disabled={ro} onChange={(e) => setScore(n, c.id, Number(e.target.value))} className="w-full accent-brand-600 disabled:opacity-60" aria-label={`${c.name} score for ${n.name}`} />
                    </div>
                  );
                })}
                <Textarea className="min-h-[60px]" placeholder="Private notes (optional)" disabled={ro || !s} value={s?.comment || ''} onChange={(e) => setComment(n, e.target.value)} />
              </div>
            </Card>
          );
        })}
      </div>
      {!noms.length && <Card><EmptyState title="No nominees to score in this category" /></Card>}
    </>
  );
}
