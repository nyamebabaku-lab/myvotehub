// A nominee's private vote dashboard, opened from the secret link their organiser shares.
// One combined total: web and USSD votes are never shown separately here.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Trophy, TrendingUp, Share2, Smartphone, Radio, LinkIcon, UserX } from 'lucide-react';
import { supabase, must } from '../../lib/supabase';
import { publicUrl, shareLink } from '../../lib/share';
import { PUBLIC_SITE, ADMIN_APP } from '../../config';
import { Button, Card, CardHeader, EmptyState, cx } from '../../components/ui';
import { Cover, NomineePhoto, Countdown } from '../../components/event';
import { QRCode } from '../../components/QR';
import TrendChart from '../../components/TrendChart';
import Logo from '../../components/layout/Logo';

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

export default function NomineeDashboard() {
  const { token } = useParams();
  const [d, setD] = useState(undefined);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    let alive = true;
    let last = null;
    const load = async () => {
      try {
        const r = must(await supabase.rpc('nominee_dashboard', { t: token }));
        if (!alive) return;
        if (last != null && r && r.total !== last) {
          setBump(true);
          setTimeout(() => setBump(false), 900);
        }
        last = r?.total ?? null;
        setD(r);
      } catch {
        if (alive && d === undefined) setD(null);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll for this token only
  }, [token]);

  if (d === undefined) return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-navy-950"><Radio className="h-7 w-7 animate-pulse text-brand-600" /></div>;
  if (!d)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-navy-950">
        <Logo />
        <Card className="mt-8 w-full max-w-md"><EmptyState icon={LinkIcon} title="This link doesn’t work" text="It may have been reset by your organiser. Ask them for your new dashboard link." /></Card>
      </div>
    );

  const n = d.nominee;
  const e = d.event;
  const base = ADMIN_APP ? PUBLIC_SITE : null;
  const voteUrl = base ? `${base}#/e/${e.id}/n/${n.id}` : publicUrl(`/e/${e.id}/n/${n.id}`);
  const live = e.status === 'live' && new Date(e.endAt) > new Date();
  const evicted = n.status === 'evicted';

  return (
    <div className="min-h-screen bg-slate-50 pb-12 dark:bg-navy-950">
      <Cover event={e} className="text-white" iconSize="h-48 w-48">
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/40 to-transparent" />
        <div className="relative mx-auto max-w-3xl px-4 pb-6 pt-5 sm:px-6">
          <div className="flex items-center justify-between">
            <Logo dark />
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
              <span className={cx('h-2 w-2 rounded-full', live ? 'animate-pulse bg-emerald-400' : 'bg-white/50')} /> {live ? 'Live' : 'Voting closed'}
            </span>
          </div>
          <div className="mt-8 flex items-center gap-4">
            <NomineePhoto nominee={n} className="h-20 w-20 ring-4 ring-white/30 sm:h-24 sm:w-24" text="text-2xl" />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-white/70">My votes · {d.category}</p>
              <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{n.name}</h1>
              <p className="truncate text-sm text-white/80">{e.title} · <span className="font-mono">{n.code}</span></p>
            </div>
          </div>
        </div>
      </Cover>

      <div className="mx-auto -mt-2 max-w-3xl space-y-5 px-4 sm:px-6">
        {evicted && (
          <p className="mt-6 flex items-center gap-2 rounded-2xl bg-accent-50 p-4 text-sm font-bold text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">
            <UserX className="h-5 w-5" /> You were evicted. Thank you for taking part!
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="col-span-2 p-5 sm:col-span-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total votes{e.roundLabel ? ` · ${e.roundLabel}` : ''}</p>
            <p className={cx('mt-1 text-4xl font-black tabular-nums text-brand-700 transition-transform duration-300 dark:text-white', bump && 'scale-110 text-accent-600')}>{Number(d.total).toLocaleString()}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-emerald-600">+{Number(d.today).toLocaleString()}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Position</p>
            {d.rank ? (
              <p className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">{ordinal(d.rank)} <span className="text-sm font-semibold text-slate-500">of {d.competitors}</span></p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Hidden until the results are announced</p>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Votes per day" subtitle="Last 14 days" icon={TrendingUp} />
          <div className="p-3 pt-1">
            <TrendChart data={d.daily} series={[{ key: 'votes', name: 'Votes', color: 'primary' }]} format={(v) => `${Number(v).toLocaleString()} votes`} height={200} />
          </div>
        </Card>

        {live && !evicted && (
          <Card className="overflow-hidden">
            <CardHeader title="Ask your fans to vote" subtitle="Share your link, or the USSD code for phones without data" icon={Trophy} />
            <div className="flex flex-col items-center gap-5 p-5 pt-3 sm:flex-row">
              <div className="rounded-2xl bg-white p-2 ring-1 ring-slate-200"><QRCode value={voteUrl} size={140} /></div>
              <div className="w-full space-y-3">
                <Button variant="danger" className="w-full" icon={Share2} onClick={() => shareLink(voteUrl, `Vote for ${n.name} (${n.code})`)}>Share my voting link</Button>
                {d.ussdCode && (
                  <p className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    <span>Dial <b>{d.ussdCode}</b>, choose <b>1</b> and enter <b className="font-mono">{n.code}</b></span>
                  </p>
                )}
                <Countdown target={e.endAt} label="Voting closes in" />
              </div>
            </div>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400">
          Updates every few seconds{d.testMode ? ' · Test mode: includes test votes' : ''} · This link is private, don’t post it publicly.
          {!base && <> · <Link to={`/e/${e.id}`} className="font-bold text-brand-600">Event page</Link></>}
        </p>
      </div>
    </div>
  );
}
