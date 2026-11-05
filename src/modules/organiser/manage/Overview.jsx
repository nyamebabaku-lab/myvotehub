import { useEffect, useMemo, useState } from 'react';
import { Vote, Users, Banknote, TrendingUp, Radio, Smartphone, Share2, Copy, Zap } from 'lucide-react';
import { useDB } from '../../../data/store';
import { LIVE, PUBLIC_SITE } from '../../../config';
import { useCurrentUser } from '../../../data/selectors';
import { compactNum, dailySeries, money, moneyShort, pct, sum } from '../../../lib/format';
import { walletFor } from '../../../lib/wallet';
import { eventPhase } from '../../../lib/voting';
import { methodLabel } from '../../../lib/payments';
import { startSimulation, stopSimulation, simulating } from '../../../lib/events';
import { publicUrl, shareLink } from '../../../lib/share';
import { Button, Card, CardHeader, StatCard, toast, cx } from '../../../components/ui';
import { QRCode } from '../../../components/QR';
import TrendChart from '../../../components/TrendChart';

function SplitList({ rows }) {
  const total = Math.max(1, sum(rows, (r) => r[1]));
  return (
    <div className="space-y-3 px-5 pb-5 pt-2">
      {rows.map(([label, v]) => (
        <div key={label}>
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>
            <span className="tabular-nums text-slate-500">{v.toLocaleString()} · {pct(v, total)}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${(v / total) * 100}%` }} />
          </div>
        </div>
      ))}
      {!rows.length && <p className="text-sm text-slate-400">No votes yet.</p>}
    </div>
  );
}

export default function Overview({ event }) {
  const user = useCurrentUser();
  const db = useDB();
  const [sim, setSim] = useState(simulating());
  useEffect(() => () => stopSimulation(), []);
  const votes = db.votes.filter((v) => v.eventId === event.id && !v.void);
  const w = walletFor(event.companyId, db, event.id);
  const series = useMemo(() => dailySeries(votes, 14, { votes: (v) => v.qty }, (v) => v.at, new Date(Math.min(Date.now(), new Date(event.endAt).getTime()))), [votes, event.endAt]);
  const cats = db.categories.filter((c) => c.eventId === event.id);
  const byCat = cats.map((c) => [c.name, sum(votes.filter((v) => v.categoryId === c.id), (v) => v.qty)]).sort((a, b) => b[1] - a[1]);
  const channels = Object.entries(votes.reduce((a, v) => ({ ...a, [v.channel]: (a[v.channel] || 0) + v.qty }), {})).map(([k, v]) => [k === 'web' ? 'Web & app' : k.toUpperCase(), v]);
  const methods = Object.entries(db.payments.filter((p) => p.eventId === event.id && p.status === 'success').reduce((a, p) => ({ ...a, [p.method]: (a[p.method] || 0) + p.amount }), {})).map(([k, v]) => [methodLabel(k), Math.round(v)]);
  const voters = new Set(votes.map((v) => v.voter)).size;
  const url = LIVE ? `${PUBLIC_SITE}#/e/${event.id}` : publicUrl(`/e/${event.id}`);
  const lastHour = sum(votes.filter((v) => Date.now() - new Date(v.at).getTime() < 3600000), (v) => v.qty);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total votes" value={compactNum(sum(votes, (v) => v.qty))} icon={Vote} tone="blue" sub={`${lastHour.toLocaleString()} in the last hour`} />
        <StatCard label="Unique voters" value={compactNum(voters)} icon={Users} tone="violet" sub={`${votes.length.toLocaleString()} vote actions`} />
        {event.votingMode === 'paid' ? (
          <>
            <StatCard label="Gross sales" value={moneyShort(w.gross)} icon={Banknote} tone="green" sub={`${w.txCount.toLocaleString()} payments`} />
            <StatCard label={user.role === 'admin' ? 'Commission' : 'Your earnings'} value={moneyShort(user.role === 'admin' ? w.commission : w.net)} icon={TrendingUp} tone="red" sub={user.role === 'admin' ? 'Platform share' : `after ${money(w.commission)} commission`} />
          </>
        ) : (
          <>
            <StatCard label="Categories" value={cats.length} icon={Radio} tone="green" sub="Free poll" />
            <StatCard label="Verified phones" value={compactNum(voters)} icon={Smartphone} tone="red" sub="One vote per phone" />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Votes per day" subtitle="14 days" icon={TrendingUp} />
          <div className="p-3 pt-2"><TrendChart data={series} series={[{ key: 'votes', name: 'Votes', color: 'primary' }]} format={(v) => `${v.toLocaleString()} votes`} /></div>
        </Card>
        <Card>
          <CardHeader title="Share & promote" icon={Share2} />
          <div className="flex flex-col items-center gap-3 p-5 pt-3">
            <QRCode value={url} size={150} />
            <div className="flex w-full gap-2">
              <Button variant="secondary" className="flex-1" icon={Copy} onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Link copied'))}>Copy link</Button>
              <Button variant="secondary" className="flex-1" icon={Share2} onClick={() => shareLink(url, event.title)}>Share</Button>
            </div>
            {!LIVE && eventPhase(event) === 'live' && (
              <button
                type="button"
                onClick={() => {
                  if (sim) stopSimulation();
                  else startSimulation(event.id);
                  setSim(!sim);
                }}
                className={cx('mt-2 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-3 text-left text-sm transition', sim ? 'border-accent-400 bg-accent-50 dark:bg-accent-500/10' : 'border-slate-200 dark:border-white/10')}
              >
                <Zap className={cx('h-5 w-5', sim ? 'animate-pulse text-accent-600' : 'text-slate-400')} />
                <span><b className="block text-slate-800 dark:text-white">{sim ? 'Simulating live traffic…' : 'Simulate live voting'}</b><span className="text-xs text-slate-500">Demo only: adds random votes every 1.5s</span></span>
              </button>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Votes by category" /><SplitList rows={byCat} /></Card>
        <Card><CardHeader title="Voting channel" /><SplitList rows={channels} /></Card>
        <Card><CardHeader title={event.votingMode === 'paid' ? `Payment method (${money(0).split(' ')[0]})` : 'Payment method'} /><SplitList rows={methods} /></Card>
      </div>
    </div>
  );
}
