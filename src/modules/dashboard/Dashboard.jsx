import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banknote, Percent, Radio, Wallet, Building2, Vote, TrendingUp, Gavel, ShieldCheck, ArrowRight, Plus, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser, useMyEvents } from '../../data/selectors';
import { compactNum, dailySeries, fmtDateTime, money, moneyShort, sum } from '../../lib/format';
import { eventPhase } from '../../lib/voting';
import { walletFor, platformRevenue } from '../../lib/wallet';
import { judgeProgress } from '../../lib/results';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Progress, StatCard } from '../../components/ui';
import { Cover, PhaseBadge } from '../../components/event';
import TrendChart from '../../components/TrendChart';

function TopEvents({ events, payments, votes }) {
  const rows = events
    .map((e) => ({ e, gross: sum(payments.filter((p) => p.eventId === e.id && p.status === 'success'), (p) => p.amount), votes: sum(votes.filter((v) => v.eventId === e.id && !v.void), (v) => v.qty) }))
    .sort((a, b) => b.gross - a.gross || b.votes - a.votes)
    .slice(0, 6);
  const top = Math.max(1, ...rows.map((r) => r.gross));
  return (
    <div className="divide-y divide-slate-100 px-5 pb-3 dark:divide-white/5">
      {rows.map(({ e, gross, votes: v }) => (
        <Link key={e.id} to={`/app/events/${e.id}`} className="flex items-center gap-3 py-3 hover:opacity-80">
          <Cover event={e} className="h-10 w-10 shrink-0 rounded-xl" iconSize="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate font-bold text-slate-800 dark:text-white">{e.title}</span>
              <span className="font-bold tabular-nums">{e.votingMode === 'free' ? `${compactNum(v)} votes` : money(gross)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${e.votingMode === 'free' ? 0 : (gross / top) * 100}%` }} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Activity({ audit, users }) {
  return (
    <div className="space-y-4 px-5 pb-5 pt-2">
      {audit.slice(0, 7).map((a) => (
        <div key={a.id} className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.action}</p>
            <p className="truncate text-xs text-slate-500">{a.detail}</p>
            <p className="text-[11px] text-slate-400">{fmtDateTime(a.at)} · {users.find((u) => u.id === a.userId)?.name || 'System'}</p>
          </div>
        </div>
      ))}
      {!audit.length && <p className="text-sm text-slate-400">No activity yet.</p>}
    </div>
  );
}

function AdminDashboard() {
  const db = useDB();
  const navigate = useNavigate();
  const { commission, gross } = platformRevenue(db);
  const live = db.events.filter((e) => eventPhase(e) === 'live');
  const pendingW = db.withdrawals.filter((w) => w.status === 'pending');
  const pendingEvents = db.events.filter((e) => e.status === 'pending');
  const pendingCos = db.companies.filter((c) => c.status === 'pending');
  const ok = db.payments.filter((p) => p.status === 'success');
  const series = useMemo(() => dailySeries(ok, 14, { gross: (p) => p.amount, commission: (p) => p.commission }), [ok]);
  const todos = [
    [ShieldCheck, `${pendingEvents.length} event${pendingEvents.length !== 1 ? 's' : ''} awaiting approval`, '/app/approvals', pendingEvents.length],
    [Wallet, `${pendingW.length} withdrawal${pendingW.length !== 1 ? 's' : ''} to review · ${money(sum(pendingW, (w) => w.amount))}`, '/app/withdrawals', pendingW.length],
    [Building2, `${pendingCos.length} compan${pendingCos.length !== 1 ? 'ies' : 'y'} awaiting KYC`, '/app/companies', pendingCos.length],
    [AlertTriangle, `${db.votes.filter((v) => v.flagged && !v.void).length} flagged vote records`, '/app/events', db.votes.filter((v) => v.flagged && !v.void).length],
  ];
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Everything happening across MyVoteHub right now." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Vote sales" value={moneyShort(gross)} icon={Banknote} tone="blue" sub={`${ok.length.toLocaleString()} payments`} />
        <StatCard label="Commission earned" value={money(commission)} icon={Percent} tone="red" sub="Platform revenue" />
        <StatCard label="Live events" value={live.length} icon={Radio} tone="green" sub={`${db.events.length} total`} onClick={() => navigate('/app/events')} />
        <StatCard label="Companies" value={db.companies.filter((c) => c.status === 'active').length} icon={Building2} tone="violet" sub={`${pendingCos.length} pending`} onClick={() => navigate('/app/companies')} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Vote sales vs commission" subtitle="Last 14 days" icon={TrendingUp} />
          <div className="p-3 pt-2">
            <TrendChart data={series} format={money} series={[{ key: 'gross', name: 'Vote sales', color: 'primary' }, { key: 'commission', name: 'Commission', color: 'secondary' }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Needs your attention" icon={AlertTriangle} />
          <div className="space-y-2 p-5 pt-3">
            {todos.map(([Icon, label, to, n]) => (
              <Link key={label} to={to} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-white/5 dark:hover:bg-white/5">
                <span className={n ? 'flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-500/15' : 'flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15'}>
                  {n ? <Icon className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Top events by revenue" icon={Vote} />
          <TopEvents events={db.events} payments={db.payments} votes={db.votes} />
        </Card>
        <Card>
          <CardHeader title="Recent activity" icon={Clock} action={<Link to="/app/audit" className="text-xs font-bold text-brand-600">View all</Link>} />
          <Activity audit={db.audit} users={db.users} />
        </Card>
      </div>
    </>
  );
}

function OrganiserDashboard({ user }) {
  const db = useDB();
  const events = useMyEvents();
  const navigate = useNavigate();
  const company = db.companies.find((c) => c.id === user.companyId);
  const w = walletFor(user.companyId, db);
  const ids = new Set(events.map((e) => e.id));
  const myVotes = db.votes.filter((v) => ids.has(v.eventId) && !v.void);
  const series = useMemo(() => dailySeries(myVotes, 14, { votes: (v) => v.qty }), [myVotes]);
  const active = events.filter((e) => ['live', 'upcoming', 'pending', 'draft'].includes(eventPhase(e)));
  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} subtitle={`${company?.name} · organiser dashboard`} actions={<Button icon={Plus} onClick={() => navigate('/app/events/new')}>New event</Button>} />
      {company?.status === 'pending' && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          <div><b>Your company is being verified.</b> You can build events now; they go live once MyVoteHub approves your company and the event.</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total votes" value={compactNum(sum(myVotes, (v) => v.qty))} icon={Vote} tone="blue" sub={`${events.length} events`} />
        <StatCard label="Gross sales" value={moneyShort(w.gross)} icon={Banknote} tone="violet" sub={`${w.txCount.toLocaleString()} payments`} />
        <StatCard label="Your earnings" value={moneyShort(w.net)} icon={TrendingUp} tone="green" sub={`after ${company?.commissionPct}% commission`} />
        <StatCard label="Available" value={money(w.available)} icon={Wallet} tone="red" sub={w.pending ? `${money(w.pending)} pending` : 'Ready to withdraw'} onClick={() => navigate('/app/wallet')} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Votes per day" subtitle="All your events · last 14 days" icon={TrendingUp} />
          <div className="p-3 pt-2">
            <TrendChart data={series} format={(v) => `${v.toLocaleString()} votes`} series={[{ key: 'votes', name: 'Votes', color: 'primary' }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Top events" icon={Vote} />
          <TopEvents events={events} payments={db.payments} votes={db.votes} />
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-slate-900 dark:text-white">Active events</h2>
      {active.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((e) => (
            <Link key={e.id} to={`/app/events/${e.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-lift">
              <Cover event={e} className="h-16 w-16 shrink-0 rounded-2xl" iconSize="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900 dark:text-white">{e.title}</p>
                <div className="mt-1 flex items-center gap-2"><PhaseBadge event={e} /></div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card><EmptyState title="No active events" text="Create your first event to start collecting votes." action={<Button icon={Plus} onClick={() => navigate('/app/events/new')}>New event</Button>} /></Card>
      )}
    </>
  );
}

function JudgeDashboard({ user }) {
  const db = useDB();
  const events = useMyEvents();
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ').slice(-1)[0]}`} subtitle="Your scores are secret. Organisers only see whether you've finished until results are released." />
      <div className="grid gap-4 md:grid-cols-2">
        {events.map((e) => {
          const p = judgeProgress(e, db).find((x) => x.judge?.id === user.id);
          const done = p && p.submitted >= p.total;
          return (
            <Card key={e.id} className="overflow-hidden">
              <Cover event={e} className="h-24" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-slate-900 dark:text-white">{e.title}</p>
                    <p className="text-xs text-slate-500">{e.criteria.length} criteria · {e.judgeWeight}% of final result</p>
                  </div>
                  {e.resultsReleased ? <Badge tone="green">Released</Badge> : done ? <Badge tone="green">Submitted</Badge> : <Badge tone="amber">In progress</Badge>}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Progress value={p ? (p.submitted / Math.max(1, p.total)) * 100 : 0} tone={done ? 'green' : 'blue'} />
                  <span className="whitespace-nowrap text-xs font-bold text-slate-500">{p?.submitted}/{p?.total}</span>
                </div>
                <Link to={`/app/judging/${e.id}`}>
                  <Button className="mt-4 w-full" icon={Gavel} variant={done ? 'secondary' : 'primary'}>{done ? 'Review my scores' : 'Continue scoring'}</Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
      {!events.length && <Card><EmptyState icon={Gavel} title="No events assigned" text="An organiser will add you to an event's judging panel." /></Card>}
    </>
  );
}

export default function Dashboard() {
  const user = useCurrentUser();
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'judge') return <JudgeDashboard user={user} />;
  return <OrganiserDashboard user={user} />;
}
