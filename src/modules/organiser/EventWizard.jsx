// Event builder: details → voting → categories & nominees → judges & results → review.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Coins, LayoutList, Gavel, ClipboardCheck, Check, ArrowLeft, ArrowRight, Plus, Trash2, UserPlus } from 'lucide-react';
import { useDB } from '../../data/store';
import { LIVE } from '../../config';
import { useCurrentUser } from '../../data/selectors';
import { DEFAULT_BUNDLES } from '../../data/constants';
import { money } from '../../lib/format';
import { categoryCode, submitEvent } from '../../lib/events';
import { Button, Card, Field, Input, Select, Textarea, cx, toast, KeyValue, PageHeader, EmptyState } from '../../components/ui';
import { COVERS, Cover, ImagePicker, TYPE } from '../../components/event';

const STEPS = [
  ['Details', FileText],
  ['Voting', Coins],
  ['Categories', LayoutList],
  ['Judges & results', Gavel],
  ['Review', ClipboardCheck],
];
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v) => new Date(v).toISOString();

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/20')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-bold text-slate-800 dark:text-white">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export default function EventWizard() {
  const { id } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const db = useDB();
  const existing = db.events.find((e) => e.id === id);
  const editing = !!existing;
  const day = 86400000;
  const [step, setStep] = useState(0);
  const [f, setF] = useState(() =>
    existing
      ? { ...existing, criteria: existing.criteria.map((c) => ({ ...c })), bundles: existing.bundles.map((b) => ({ ...b })) }
      : {
          companyId: user.companyId || db.companies[0].id, title: '', type: 'awards', tagline: '', description: '', venue: '', cover: 'blue', image: null,
          startAt: new Date(Date.now() + day).toISOString(), endAt: new Date(Date.now() + 22 * day).toISOString(),
          votingMode: 'paid', pricePerVote: 1, bundles: DEFAULT_BUNDLES.map((b) => ({ ...b })), freeVotesPerVoter: 1, freePeriod: 'event', requireOtp: true,
          showLeaderboard: true, showCounts: true, publicWeight: 100, judgeWeight: 0, criteria: [{ id: 'c1', name: 'Overall', max: 100 }], judgeIds: [], rounds: null,
        },
  );
  const [cats, setCats] = useState([{ key: 1, name: '', names: '' }]);
  const [newJudge, setNewJudge] = useState({ name: '', email: '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  // Live: only approved judges can be put on a panel.
  const judges = db.users.filter((u) => u.role === 'judge' && u.companyId === f.companyId && (!LIVE || u.status === 'active'));
  const usingJudges = f.judgeWeight > 0;

  const validate = () => {
    if (step === 0) {
      if (!f.title.trim()) return 'Give your event a title';
      if (new Date(f.endAt) <= new Date(f.startAt)) return 'Voting must close after it opens';
    }
    if (step === 1 && f.votingMode === 'paid') {
      if (!(f.pricePerVote > 0)) return 'Set a price per vote';
      if (f.bundles.some((b) => !(b.votes > 0) || !(b.price > 0))) return 'Every bundle needs votes and a price';
    }
    if (step === 2 && !editing && !cats.some((c) => c.name.trim())) return 'Add at least one category';
    if (step === 3 && usingJudges) {
      if (!f.criteria.length || f.criteria.some((c) => !c.name.trim() || !(c.max > 0))) return 'Each judging criterion needs a name and a maximum score';
      if (!f.judgeIds.length) return 'Pick at least one judge, or set judges to 0%';
    }
    return null;
  };
  const next = () => {
    const err = validate();
    if (err) return toast.error(err);
    setStep((s) => s + 1);
  };

  const addJudge = () => {
    if (!newJudge.name.trim() || !/\S+@\S+/.test(newJudge.email)) return toast.error('Enter the judge’s name and email');
    if (db.users.some((u) => u.email.toLowerCase() === newJudge.email.toLowerCase())) return toast.error('That email already has an account');
    const u = db.add('users', { role: 'judge', companyId: f.companyId, name: newJudge.name.trim(), email: newJudge.email.trim(), title: 'Judge', password: 'demo123', status: 'active' });
    set('judgeIds', [...f.judgeIds, u.id]);
    setNewJudge({ name: '', email: '' });
    toast.success('Judge invited', `${u.name} can sign in with ${u.email} / demo123`);
  };

  const save = (submit) => {
    const payload = { ...f, judgeIds: usingJudges ? f.judgeIds : [], publicWeight: 100 - f.judgeWeight };
    let ev;
    if (editing) {
      db.update('events', existing.id, payload);
      ev = { ...existing, ...payload };
      db.log('Event updated', ev.title, { eventId: ev.id, companyId: ev.companyId });
    } else {
      ev = db.add('events', { ...payload, status: 'draft', resultsReleased: false, timezone: 'Africa/Accra' });
      const taken = [];
      cats.filter((c) => c.name.trim()).forEach((c, i) => {
        const code = categoryCode(c.name, taken);
        taken.push(code);
        const cat = db.add('categories', { eventId: ev.id, name: c.name.trim(), code, order: i, description: '' });
        const names = c.names.split('\n').map((x) => x.trim()).filter(Boolean);
        db.addMany('nominees', names.map((nm, j) => ({ eventId: ev.id, categoryId: cat.id, name: nm, code: `${code}-${String(j + 1).padStart(2, '0')}`, bio: '', photo: null, status: 'active' })));
      });
      db.log('Event created', ev.title, { eventId: ev.id, companyId: ev.companyId });
    }
    if (submit && ['draft', 'rejected'].includes(ev.status)) submitEvent(ev);
    toast.success(submit ? 'Submitted for approval' : 'Saved', ev.title);
    navigate(`/app/events/${ev.id}`);
  };

  if (editing && user.role === 'organiser' && existing.companyId !== user.companyId) return <EmptyState title="Not your event" />;

  return (
    <>
      <PageHeader title={editing ? `Edit · ${existing.title}` : 'Create an event'} subtitle="You can change everything later until voting opens." />
      <ol className="mb-6 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {STEPS.map(([l, Icon], i) => (
          <li key={l}>
            <button type="button" onClick={() => i < step && setStep(i)} className={cx('flex items-center gap-2 whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-bold transition', i === step ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25' : i < step ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-white text-slate-400 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10')}>
              {i < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />} {l}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 sm:p-6">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {user.role === 'admin' && !editing && (
                <Field label="Company" className="sm:col-span-2"><Select value={f.companyId} onChange={(e) => set('companyId', e.target.value)} options={db.companies.map((c) => ({ value: c.id, label: c.name }))} /></Field>
              )}
              <Field label="Event title *" className="sm:col-span-2"><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Campus Excellence Awards 2026" /></Field>
              <div className="sm:col-span-2">
                <span className="label">Event type</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(TYPE).map(([k, t]) => (
                    <button key={k} type="button" onClick={() => setF((x) => ({ ...x, type: k, rounds: k === 'reality' && !x.rounds ? { current: 1, carryOver: false, autoEvict: 1, list: [{ n: 1, label: 'Week 1', closedAt: null }] } : x.rounds }))} className={cx('flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-sm font-bold transition', f.type === k ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300')}>
                      <t.icon className="h-5 w-5" /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Tagline" className="sm:col-span-2"><Input value={f.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="One line that sells it" /></Field>
              <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Tell voters what this is about and how winners are decided." /></Field>
              <Field label="Venue"><Input value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Optional" /></Field>
              <div />
              <Field label="Voting opens"><Input type="datetime-local" value={toLocal(f.startAt)} onChange={(e) => e.target.value && set('startAt', fromLocal(e.target.value))} /></Field>
              <Field label="Voting closes"><Input type="datetime-local" value={toLocal(f.endAt)} onChange={(e) => e.target.value && set('endAt', fromLocal(e.target.value))} /></Field>
              <div className="sm:col-span-2">
                <span className="label">Cover</span>
                <div className="flex flex-wrap items-center gap-2">
                  {Object.keys(COVERS).map((k) => (
                    <button key={k} type="button" onClick={() => set('cover', k)} aria-label={k} className={cx('h-10 w-14 rounded-xl bg-gradient-to-br ring-offset-2 transition dark:ring-offset-navy-900', COVERS[k], f.cover === k && !f.image && 'ring-2 ring-brand-600')} />
                  ))}
                  <ImagePicker value={f.image} onChange={(v) => set('image', v)} max={1200} label="Upload banner" className="ml-1" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {[['paid', 'Paid voting', 'Voters buy votes with MoMo or card. You earn from every vote.'], ['free', 'Free voting', 'One verified vote per phone number. Great for polls and campus events.']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => set('votingMode', k)} className={cx('rounded-2xl border-2 p-4 text-left transition', f.votingMode === k ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-white/10')}>
                    <p className="font-extrabold text-slate-900 dark:text-white">{l}</p>
                    <p className="mt-1 text-xs text-slate-500">{d}</p>
                  </button>
                ))}
              </div>
              {f.votingMode === 'paid' ? (
                <>
                  <Field label={`Price per vote (${money(0).split(' ')[0]})`} className="max-w-xs"><Input type="number" min={0.1} step={0.1} value={f.pricePerVote} onChange={(e) => set('pricePerVote', Number(e.target.value))} /></Field>
                  <div>
                    <span className="label">Vote bundles</span>
                    <div className="space-y-2">
                      {f.bundles.map((b, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input type="number" min={1} value={b.votes} onChange={(e) => set('bundles', f.bundles.map((x, j) => (j === i ? { ...x, votes: Number(e.target.value) } : x)))} className="w-28" />
                          <span className="text-sm text-slate-500">votes for</span>
                          <Input type="number" min={0.1} step={0.5} value={b.price} onChange={(e) => set('bundles', f.bundles.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} className="w-28" />
                          <span className="hidden text-xs text-slate-400 sm:inline">{b.votes * f.pricePerVote > b.price ? `${Math.round((1 - b.price / (b.votes * f.pricePerVote)) * 100)}% off` : ''}</span>
                          <button type="button" onClick={() => set('bundles', f.bundles.filter((_, j) => j !== i))} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-accent-50 hover:text-accent-600" aria-label="Remove bundle"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                    {f.bundles.length < 6 && <Button size="sm" variant="soft" icon={Plus} className="mt-2" onClick={() => set('bundles', [...f.bundles, { votes: 20, price: 18 }])}>Add bundle</Button>}
                  </div>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Free votes per phone, per category"><Input type="number" min={1} max={10} value={f.freeVotesPerVoter} onChange={(e) => set('freeVotesPerVoter', Number(e.target.value))} /></Field>
                  <Field label="Limit resets"><Select value={f.freePeriod} onChange={(e) => set('freePeriod', e.target.value)} options={[{ value: 'event', label: 'Never (once per event)' }, { value: 'daily', label: 'Every day' }]} /></Field>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle checked={f.showLeaderboard} onChange={(v) => set('showLeaderboard', v)} label="Public leaderboard" hint="Voters can see rankings while voting is open" />
                <Toggle checked={f.showCounts} onChange={(v) => set('showCounts', v)} label="Show vote counts" hint="Display each nominee's number of votes" />
              </div>
            </div>
          )}

          {step === 2 &&
            (editing ? (
              <EmptyState icon={LayoutList} title="Manage categories on the event page" text="Open the Nominees tab to add, rename or remove categories and nominees, upload photos and evict." />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Add each category and type nominee names one per line. Codes like <b>SOY-01</b> are created for USSD voting. Photos and bios can be added after saving.</p>
                {cats.map((c, i) => (
                  <div key={c.key} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <Input value={c.name} placeholder={f.type === 'pageant' || f.type === 'reality' ? 'e.g. Contestants' : 'e.g. Artiste of the Year'} onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      {cats.length > 1 && <button type="button" onClick={() => setCats(cats.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-accent-50 hover:text-accent-600" aria-label="Remove category"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                    <Textarea className="mt-2" value={c.names} placeholder={'Nominee one\nNominee two\nNominee three'} onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, names: e.target.value } : x)))} />
                    <p className="mt-1 text-xs text-slate-400">{c.names.split('\n').filter((x) => x.trim()).length} nominees</p>
                  </div>
                ))}
                <Button variant="soft" icon={Plus} onClick={() => setCats([...cats, { key: Date.now(), name: '', names: '' }])}>Add category</Button>
              </div>
            ))}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-end justify-between">
                  <span className="label">How winners are decided</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{100 - f.judgeWeight}% public · {f.judgeWeight}% judges</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={f.judgeWeight} onChange={(e) => set('judgeWeight', Number(e.target.value))} className="w-full accent-brand-600" aria-label="Judges weight" />
                <div className="mt-1 flex flex-wrap gap-2">
                  {[0, 30, 40, 50, 60].map((w) => (
                    <button key={w} type="button" onClick={() => set('judgeWeight', w)} className={cx('rounded-full px-3 py-1 text-xs font-bold ring-1', f.judgeWeight === w ? 'bg-brand-600 text-white ring-brand-600' : 'ring-slate-200 dark:ring-white/10')}>
                      {w === 0 ? 'Votes only' : `${100 - w}/${w}`}
                    </button>
                  ))}
                </div>
              </div>
              {usingJudges && (
                <>
                  <div>
                    <span className="label">Judging criteria (scores are secret)</span>
                    <div className="space-y-2">
                      {f.criteria.map((c, i) => (
                        <div key={c.id} className="flex items-center gap-2">
                          <Input value={c.name} placeholder="Criterion" onChange={(e) => set('criteria', f.criteria.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                          <span className="text-sm text-slate-500">out of</span>
                          <Input type="number" min={1} value={c.max} className="w-24" onChange={(e) => set('criteria', f.criteria.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)))} />
                          <button type="button" onClick={() => set('criteria', f.criteria.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-accent-50 hover:text-accent-600" aria-label="Remove criterion"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                    <Button size="sm" variant="soft" icon={Plus} className="mt-2" onClick={() => set('criteria', [...f.criteria, { id: `c${Date.now().toString(36)}`, name: '', max: 10 }])}>Add criterion</Button>
                  </div>
                  <div>
                    <span className="label">Judging panel</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {judges.map((j) => (
                        <label key={j.id} className={cx('flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3', f.judgeIds.includes(j.id) ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-white/10')}>
                          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={f.judgeIds.includes(j.id)} onChange={(e) => set('judgeIds', e.target.checked ? [...f.judgeIds, j.id] : f.judgeIds.filter((x) => x !== j.id))} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{j.name}</span>
                            <span className="block truncate text-xs text-slate-500">{j.email}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {LIVE ? (
                      <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                        New judge? They create an account with your company code <b className="font-mono">{db.companies.find((c) => c.id === f.companyId)?.joinCode}</b> (Team &amp; judges). They appear here once MyVoteHub approves them.
                      </p>
                    ) : (
                    <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-white/5 sm:flex-row">
                      <Input placeholder="New judge name" value={newJudge.name} onChange={(e) => setNewJudge({ ...newJudge, name: e.target.value })} />
                      <Input placeholder="Email" type="email" value={newJudge.email} onChange={(e) => setNewJudge({ ...newJudge, email: e.target.value })} />
                      <Button variant="secondary" icon={UserPlus} onClick={addJudge}>Invite</Button>
                    </div>
                    )}
                  </div>
                </>
              )}
              <Toggle
                checked={!!f.rounds}
                onChange={(v) => set('rounds', v ? { current: 1, carryOver: false, autoEvict: 1, list: [{ n: 1, label: 'Week 1', closedAt: null }] } : null)}
                label="Weekly rounds & evictions"
                hint="Reality-show style: close each round to evict the lowest-scoring nominees"
              />
              {f.rounds && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Evict per round (per category)"><Input type="number" min={0} max={5} value={f.rounds.autoEvict} onChange={(e) => set('rounds', { ...f.rounds, autoEvict: Number(e.target.value) })} /></Field>
                  <Field label="Votes between rounds"><Select value={f.rounds.carryOver ? 'carry' : 'reset'} onChange={(e) => set('rounds', { ...f.rounds, carryOver: e.target.value === 'carry' })} options={[{ value: 'reset', label: 'Reset every round' }, { value: 'carry', label: 'Carry over' }]} /></Field>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <KeyValue
                items={[
                  ['Title', f.title],
                  ['Type', TYPE[f.type].label],
                  ['Voting', f.votingMode === 'paid' ? `Paid · ${money(f.pricePerVote)} per vote · ${f.bundles.length} bundles` : `Free · ${f.freeVotesPerVoter} per phone ${f.freePeriod === 'daily' ? 'per day' : ''}`],
                  ['Result weighting', `${100 - f.judgeWeight}% public / ${f.judgeWeight}% judges`],
                  ['Judges', usingJudges ? `${f.judgeIds.length} judges · ${f.criteria.length} criteria` : 'None'],
                  ['Rounds', f.rounds ? `Evict ${f.rounds.autoEvict} per round · votes ${f.rounds.carryOver ? 'carry over' : 'reset'}` : 'Off'],
                  ['Categories', editing ? db.categories.filter((c) => c.eventId === existing.id).length : cats.filter((c) => c.name.trim()).length],
                  ['Leaderboard', f.showLeaderboard ? 'Public' : 'Hidden until results'],
                ]}
              />
              {db.settings.requireEventApproval && (!editing || ['draft', 'rejected'].includes(existing.status)) && (
                <p className="mt-6 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 dark:bg-brand-500/10 dark:text-brand-100">MyVoteHub reviews new events before they go public, usually within a few hours.</p>
              )}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-5 dark:border-white/5">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => (step ? setStep(step - 1) : navigate(-1))}>{step ? 'Back' : 'Cancel'}</Button>
            {step < 4 ? (
              <Button onClick={next}>Continue <ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => save(false)}>{editing ? 'Save changes' : 'Save as draft'}</Button>
                {(!editing || ['draft', 'rejected'].includes(existing.status)) && <Button variant="danger" onClick={() => save(true)}>Submit for approval</Button>}
              </div>
            )}
          </div>
        </Card>

        <div className="hidden xl:block">
          <p className="label">Preview</p>
          <div className="card overflow-hidden">
            <Cover event={f} className="h-40" />
            <div className="p-4">
              <p className="font-extrabold text-slate-900 dark:text-white">{f.title || 'Your event title'}</p>
              <p className="text-sm text-slate-500">{f.tagline || 'Tagline'}</p>
              <p className="mt-3 text-xs font-bold text-brand-600">{f.votingMode === 'paid' ? `${money(f.pricePerVote)} per vote` : 'Free voting'} · {100 - f.judgeWeight}/{f.judgeWeight}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
