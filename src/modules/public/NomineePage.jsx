import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Share2, Smartphone, Trophy, Hash, Download } from 'lucide-react';
import { useDB } from '../../data/store';
import { useTally } from '../../data/selectors';
import { compactNum } from '../../lib/format';
import { eventPhase, isPublic } from '../../lib/voting';
import { shareLink, publicUrl } from '../../lib/share';
import { Button, EmptyState } from '../../components/ui';
import { Countdown, Cover, NomineePhoto, PhaseBadge } from '../../components/event';
import { QRCode } from '../../components/QR';
import VoteSheet from './VoteSheet';

export default function NomineePage() {
  const { eventId, nomineeId } = useParams();
  const event = useDB((s) => s.events.find((e) => e.id === eventId));
  const nominee = useDB((s) => s.nominees.find((n) => n.id === nomineeId));
  const category = useDB((s) => s.categories.find((c) => c.id === nominee?.categoryId));
  const peers = useDB((s) => s.nominees.filter((n) => n.categoryId === nominee?.categoryId));
  const tally = useTally(event);
  const [open, setOpen] = useState(false);
  if (!event || !nominee || !isPublic(event)) return <EmptyState title="Nominee not found" />;

  const live = eventPhase(event) === 'live';
  const votes = tally[nominee.id] || 0;
  const competing = peers.filter((p) => p.status !== 'evicted').sort((a, b) => (tally[b.id] || 0) - (tally[a.id] || 0));
  const rank = competing.findIndex((p) => p.id === nominee.id) + 1;
  const url = publicUrl(`/e/${event.id}/n/${nominee.id}`);
  const saveCard = () => {
    const c = document.querySelector('#share-card canvas');
    if (!c) return;
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `${nominee.code}-qr.png`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to={`/e/${event.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> {event.title}
      </Link>
      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card overflow-hidden">
          <div className="grid sm:grid-cols-[280px_1fr]">
            <NomineePhoto nominee={nominee} className="aspect-square w-full sm:h-full" rounded="rounded-none" text="text-7xl" />
            <div className="flex flex-col p-6">
              <div className="flex flex-wrap items-center gap-2">
                <PhaseBadge event={event} />
                <span className="chip bg-slate-100 font-mono text-slate-600 dark:bg-white/10 dark:text-slate-300"><Hash className="h-3 w-3" />{nominee.code}</span>
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-600">{category?.name}</p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{nominee.name}</h1>
              {nominee.bio && <p className="mt-3 text-slate-600 dark:text-slate-300">{nominee.bio}</p>}
              {nominee.status === 'evicted' ? (
                <p className="mt-6 rounded-2xl bg-accent-50 p-4 text-sm font-bold text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">This nominee was evicted in {event.rounds?.list.find((r) => r.n === nominee.evictedRound)?.label || 'an earlier round'}.</p>
              ) : (
                event.showCounts && (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-500/10">
                      <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Votes{event.rounds && ' this week'}</p>
                      <p className="mt-1 text-3xl font-extrabold tabular-nums text-brand-800 dark:text-white">{compactNum(votes)}</p>
                    </div>
                    {event.showLeaderboard && (
                      <div className="rounded-2xl bg-accent-50 p-4 dark:bg-accent-500/10">
                        <p className="text-xs font-bold uppercase tracking-wider text-accent-600">Position</p>
                        <p className="mt-1 text-3xl font-extrabold text-accent-700 dark:text-white">#{rank} <span className="text-sm font-semibold text-slate-500">of {competing.length}</span></p>
                      </div>
                    )}
                  </div>
                )
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                {nominee.status !== 'evicted' && (
                  <Button variant="danger" size="lg" className="flex-1" disabled={!live} onClick={() => setOpen(true)}>
                    {live ? `Vote for ${nominee.name.split(' — ')[0].replace(/[“”]/g, '')}` : 'Voting closed'}
                  </Button>
                )}
                <Button variant="secondary" size="lg" icon={Share2} onClick={() => shareLink(url, `Vote for ${nominee.name}`)}>Share</Button>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div id="share-card" className="overflow-hidden rounded-3xl shadow-lift">
            <Cover event={event} className="p-6 text-white" iconSize="h-32 w-32">
              <p className="relative text-xs font-bold uppercase tracking-widest text-white/80">Vote for me</p>
              <div className="relative mt-3 flex items-center gap-3">
                <NomineePhoto nominee={nominee} className="h-16 w-16 ring-4 ring-white/30" text="text-lg" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold">{nominee.name}</p>
                  <p className="truncate text-xs text-white/80">{category?.name}</p>
                </div>
              </div>
              <div className="relative mt-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Nominee code</p>
                  <p className="font-mono text-2xl font-black">{nominee.code}</p>
                  {live && <div className="mt-3"><Countdown target={event.endAt} light label="Closes in" /></div>}
                </div>
                <div className="rounded-xl bg-white p-1.5">
                  <QRCode value={url} size={96} />
                </div>
              </div>
            </Cover>
          </div>
          <Button variant="soft" className="w-full" icon={Download} onClick={saveCard}>Save QR code</Button>
          <div className="card p-5">
            <h3 className="flex items-center gap-2 font-extrabold text-slate-900 dark:text-white"><Smartphone className="h-4 w-4 text-brand-600" /> Vote without data</h3>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>Dial <b>*920*44#</b></li>
              <li>Enter code <b className="font-mono">{nominee.code}</b></li>
              <li>Choose votes and approve on MoMo</li>
            </ol>
          </div>
          <Link to={`/e/${event.id}/results`}>
            <Button variant="secondary" className="mt-1 w-full" icon={Trophy}>See the leaderboard</Button>
          </Link>
        </aside>
      </div>
      <VoteSheet event={event} nominee={nominee} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
