import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Share2, Trophy, QrCode, MonitorPlay, Gavel, Info, CalendarDays, UserX, Search } from 'lucide-react';
import { useDB } from '../../data/store';
import { compactNum, fmtDate, fmtDateTime, money } from '../../lib/format';
import { usesJudges } from '../../lib/results';
import { eventPhase, isPublic } from '../../lib/voting';
import { shareLink, publicUrl } from '../../lib/share';
import { Button, EmptyState, Modal, SearchInput, cx } from '../../components/ui';
import { Cover, Countdown, NomineePhoto, PhaseBadge, TYPE } from '../../components/event';
import { QRCode } from '../../components/QR';
import VoteSheet from './VoteSheet';
import NomineeCard from '../../components/NomineeCard';
import { useTally } from '../../data/selectors';

export default function EventPage() {
  const { eventId } = useParams();
  const event = useDB((s) => s.events.find((e) => e.id === eventId));
  const company = useDB((s) => s.companies.find((c) => c.id === event?.companyId));
  const allCats = useDB((s) => s.categories);
  const allNoms = useDB((s) => s.nominees);
  const tally = useTally(event);
  const [catId, setCatId] = useState('all');
  const [q, setQ] = useState('');
  const [voting, setVoting] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);

  if (!event || !isPublic(event)) return <EmptyState title="Event not found" text="It may be private or no longer available." action={<Link to="/explore" className="font-bold text-brand-600">Browse events</Link>} />;

  const phase = eventPhase(event);
  const cats = allCats.filter((c) => c.eventId === event.id).sort((a, b) => a.order - b.order);
  const noms = allNoms.filter((n) => n.eventId === event.id);
  const totalVotes = Object.values(tally).reduce((a, x) => a + x, 0);
  const catTotal = (cid) => noms.filter((n) => n.categoryId === cid).reduce((a, n) => a + (tally[n.id] || 0), 0);
  const round = event.rounds?.list.find((r) => r.n === event.rounds.current);
  const shown = (cid) => {
    const needle = q.trim().toLowerCase();
    return noms
      .filter((n) => n.categoryId === cid && (!needle || `${n.name} ${n.code}`.toLowerCase().includes(needle)))
      .sort((a, b) => (a.status === 'evicted') - (b.status === 'evicted') || (event.showLeaderboard ? (tally[b.id] || 0) - (tally[a.id] || 0) : a.code.localeCompare(b.code)));
  };
  const visibleCats = catId === 'all' ? cats : cats.filter((c) => c.id === catId);
  const url = publicUrl(`/e/${event.id}`);

  return (
    <div>
      <Cover event={event} className="text-white" iconSize="h-64 w-64">
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-navy-950/30 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 md:pt-20">
          <div className="flex flex-wrap items-center gap-2">
            <PhaseBadge event={event} className="bg-white/95" />
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">{TYPE[event.type]?.label}</span>
            {round && <span className="rounded-full bg-accent-600 px-2.5 py-0.5 text-xs font-bold">{round.label} · votes {event.rounds.carryOver ? 'carry over' : 'reset weekly'}</span>}
          </div>
          <p className="mt-4 text-sm font-bold uppercase tracking-widest text-white/80">{company?.name}</p>
          <h1 className="mt-1 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{event.title}</h1>
          <p className="mt-2 max-w-2xl text-white/85 sm:text-lg">{event.tagline}</p>
          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
              {event.venue && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {event.venue}</span>}
              <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {fmtDate(event.startAt, 'dd MMM')} – {fmtDate(event.endAt, 'dd MMM yyyy')}</span>
              <span className="flex items-center gap-1.5"><Trophy className="h-4 w-4" /> {compactNum(totalVotes)} votes {round ? 'this week' : ''}</span>
            </div>
            {phase === 'live' && <Countdown target={event.endAt} light />}
            {phase === 'upcoming' && <Countdown target={event.startAt} label="Voting opens in" light />}
          </div>
        </div>
      </Cover>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {[{ id: 'all', name: 'All categories' }, ...cats].map((c) => (
                <button key={c.id} onClick={() => setCatId(c.id)} className={cx('whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ring-1 transition', catId === c.id ? 'bg-brand-600 text-white ring-brand-600 shadow-lg shadow-brand-600/25' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10')}>
                  {c.name}
                </button>
              ))}
            </div>
            <SearchInput value={q} onChange={setQ} placeholder="Search nominee or code…" className="mt-4 sm:max-w-xs" />

            {visibleCats.map((c) => {
              const list = shown(c.id);
              const total = catTotal(c.id);
              let rank = 0;
              return (
                <section key={c.id} className="mt-8">
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{c.name}</h2>
                      <p className="text-xs text-slate-500">{list.length} nominees{event.showCounts && ` · ${compactNum(total)} votes`}</p>
                    </div>
                  </div>
                  {list.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                      {list.map((n) => (
                        <NomineeCard key={n.id} event={event} nominee={n} votes={tally[n.id] || 0} share={total ? ((tally[n.id] || 0) / total) * 100 : 0} rank={n.status === 'evicted' ? null : ++rank} onVote={setVoting} />
                      ))}
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-slate-400"><Search className="h-4 w-4" /> No nominee matches.</p>
                  )}
                </section>
              );
            })}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="card p-5">
              <h3 className="flex items-center gap-2 font-extrabold text-slate-900 dark:text-white"><Info className="h-4 w-4 text-brand-600" /> How voting works</h3>
              <p className="mt-2 text-sm text-slate-500">{event.description}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {event.votingMode === 'paid' ? (
                  <li className="flex justify-between"><span className="text-slate-500">Price</span><span className="font-bold">{money(event.pricePerVote)} / vote</span></li>
                ) : (
                  <li className="flex justify-between"><span className="text-slate-500">Free votes</span><span className="font-bold">{event.freeVotesPerVoter} per category {event.freePeriod === 'daily' ? 'daily' : ''}</span></li>
                )}
                {usesJudges(event) && (
                  <li className="flex justify-between"><span className="flex items-center gap-1 text-slate-500"><Gavel className="h-3.5 w-3.5" /> Judges</span><span className="font-bold">{event.judgeWeight}% of result</span></li>
                )}
                <li className="flex justify-between"><span className="text-slate-500">Public votes</span><span className="font-bold">{event.publicWeight}% of result</span></li>
                <li className="flex justify-between"><span className="text-slate-500">Closes</span><span className="font-bold">{fmtDateTime(event.endAt)}</span></li>
                {event.rounds && (
                  <li className="flex justify-between"><span className="flex items-center gap-1 text-slate-500"><UserX className="h-3.5 w-3.5" /> Evictions</span><span className="font-bold">{event.rounds.autoEvict} per week</span></li>
                )}
              </ul>
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-white/5">
                No data? Dial <span className="font-bold text-slate-700 dark:text-slate-200">*920*44#</span> and enter the nominee code to vote by USSD.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={Share2} onClick={() => shareLink(url, event.title)}>Share</Button>
              <Button variant="secondary" icon={QrCode} onClick={() => setQrOpen(true)}>QR code</Button>
              <Link to={`/e/${event.id}/results`} className="col-span-2">
                <Button className="w-full" icon={Trophy}>{event.resultsReleased ? 'Final results' : 'Leaderboard'}</Button>
              </Link>
              <Link to={`/reveal/${event.id}`} className="col-span-2">
                <Button variant="soft" className="w-full" icon={MonitorPlay}>Big-screen mode</Button>
              </Link>
            </div>
          </aside>
        </div>
      </div>

      <VoteSheet event={event} nominee={voting} open={!!voting} onClose={() => setVoting(null)} />
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="Scan to vote" subtitle={event.title} size="sm">
        <div className="flex flex-col items-center gap-3 pb-2">
          <QRCode value={url} size={220} />
          <p className="break-all text-center text-xs text-slate-500">{url}</p>
        </div>
      </Modal>
    </div>
  );
}
