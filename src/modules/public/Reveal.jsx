// Big-screen mode for the live show: animated leaderboard, then a dramatic winner reveal.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Maximize2, X, Crown, Play, RotateCcw } from 'lucide-react';
import { useDB, publicVotes, publicScores } from '../../data/store';
import { categoryResults } from '../../lib/results';
import { compactNum } from '../../lib/format';
import { NomineePhoto } from '../../components/event';
import { LogoMark } from '../../components/layout/Logo';
import { cx } from '../../components/ui';
import { QRCode } from '../../components/QR';
import { publicUrl } from '../../lib/share';

export default function Reveal() {
  const { eventId } = useParams();
  const raw = useDB();
  const db = useMemo(() => ({ ...raw, votes: publicVotes(raw), scores: publicScores(raw) }), [raw]);
  const event = db.events.find((e) => e.id === eventId);
  const cats = db.categories.filter((c) => c.eventId === eventId).sort((a, b) => a.order - b.order);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(0); // 0 = live bars; 1..3 = podium places shown (3rd first)
  const [drum, setDrum] = useState(0);
  const cat = cats[idx];
  const res = useMemo(() => event && cat && categoryResults(event, cat, db, { withJudges: event.resultsReleased }), [event, cat, db]);

  const next = (d) => {
    setIdx((i) => (i + d + cats.length) % cats.length);
    setRevealed(0);
    setDrum(0);
  };
  const step = () => {
    if (revealed === 0) setRevealed(1);
    else if (revealed === 1) setRevealed(2);
    else if (revealed === 2 && !drum) setDrum(3);
  };
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowRight') next(1);
      if (e.key === 'ArrowLeft') next(-1);
      if (e.key === ' ') {
        e.preventDefault();
        step();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  useEffect(() => {
    if (!drum) return undefined;
    const t = setTimeout(() => {
      if (drum === 1) setRevealed(3);
      setDrum((d) => Math.max(0, d - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [drum]);

  if (!event || !res) return <div className="flex h-screen items-center justify-center bg-navy-950 text-white">Event not found</div>;

  const rows = res.rows.filter((r) => r.competing);
  const top = rows.slice(0, 8);
  const max = Math.max(1, ...top.map((r) => (res.withJudges ? r.final : r.votes)));
  const podium = [rows[1], rows[0], rows[2]];
  const shownPlace = (place) => (place === 3 ? revealed >= 1 : place === 2 ? revealed >= 2 : revealed >= 3);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-navy-950 via-brand-950 to-navy-900 text-white">
      <div className="hero-glow absolute inset-0 opacity-70" />
      <div className="cover-pattern absolute inset-0 opacity-[.05]" />
      <header className="relative flex items-center gap-4 px-6 py-5 md:px-10">
        <LogoMark className="h-10 w-10" />
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-[.25em] text-brand-300">{event.title}</p>
          <p className="truncate text-sm text-white/60">{res.withJudges ? `Final · ${event.publicWeight}% public + ${event.judgeWeight}% judges` : 'Live public votes'} · {compactNum(res.totalVotes)} votes</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => document.documentElement.requestFullscreen?.()} className="rounded-xl p-2.5 text-white/70 hover:bg-white/10" aria-label="Full screen"><Maximize2 className="h-5 w-5" /></button>
          <Link to={`/e/${event.id}`} className="rounded-xl p-2.5 text-white/70 hover:bg-white/10" aria-label="Exit"><X className="h-5 w-5" /></Link>
        </div>
      </header>

      <div className="relative flex items-center justify-center gap-4 px-6">
        <button onClick={() => next(-1)} className="rounded-full p-2 hover:bg-white/10" aria-label="Previous category"><ChevronLeft className="h-7 w-7" /></button>
        <h1 key={cat.id} className="animate-fade-in text-center text-3xl font-black tracking-tight md:text-5xl">{cat.name}</h1>
        <button onClick={() => next(1)} className="rounded-full p-2 hover:bg-white/10" aria-label="Next category"><ChevronRight className="h-7 w-7" /></button>
      </div>

      <main className="relative flex flex-1 items-center justify-center px-6 py-8 md:px-16">
        {revealed === 0 ? (
          <div key={cat.id} className="w-full max-w-5xl space-y-3">
            {top.map((r, i) => {
              const v = res.withJudges ? r.final : r.votes;
              return (
                <div key={r.nominee.id} className="flex animate-fade-in items-center gap-4" style={{ animationDelay: `${i * 70}ms` }}>
                  <span className="w-8 text-right text-2xl font-black text-white/40">{i + 1}</span>
                  <NomineePhoto nominee={r.nominee} className="h-14 w-14 ring-2 ring-white/20" text="text-base" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <span className="truncate text-lg font-bold md:text-xl">{r.nominee.name}</span>
                      <span className="font-black tabular-nums md:text-xl">{res.withJudges ? v.toFixed(1) : event.showCounts ? compactNum(v) : ''}</span>
                    </div>
                    <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full origin-left animate-bar-grow rounded-full bg-gradient-to-r from-brand-500 to-sky-300 transition-all duration-1000" style={{ width: `${(v / max) * 100}%`, animationDelay: `${i * 90}ms` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid w-full max-w-5xl grid-cols-3 items-end gap-3 md:gap-8">
            {podium.map((r, i) => {
              const place = [2, 1, 3][i];
              if (!r) return <div key={i} />;
              const on = shownPlace(place);
              return (
                <div key={r.nominee.id} className="flex flex-col items-center text-center">
                  {on ? (
                    <div className="flex animate-pop flex-col items-center">
                      {place === 1 && <Crown className="mb-2 h-12 w-12 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,.6)]" />}
                      <NomineePhoto nominee={r.nominee} className={cx('ring-4', place === 1 ? 'h-32 w-32 ring-amber-400 md:h-44 md:w-44' : 'h-24 w-24 ring-white/30 md:h-32 md:w-32')} text="text-3xl" rounded="rounded-3xl" />
                      <p className={cx('mt-4 font-black', place === 1 ? 'text-xl md:text-3xl' : 'text-base md:text-xl')}>{r.nominee.name}</p>
                      <p className="text-sm text-white/60">{res.withJudges ? `${r.final.toFixed(1)} pts` : `${r.votes.toLocaleString()} votes`}</p>
                    </div>
                  ) : (
                    <div className={cx('flex items-center justify-center rounded-3xl border-2 border-dashed border-white/20 text-5xl font-black text-white/30', place === 1 ? 'h-32 w-32 md:h-44 md:w-44' : 'h-24 w-24 md:h-32 md:w-32')}>
                      {place === 1 && drum ? <span className="animate-pop text-6xl text-accent-500" key={drum}>{drum}</span> : '?'}
                    </div>
                  )}
                  <div className={cx('mt-4 w-full rounded-t-2xl bg-gradient-to-t text-3xl font-black', place === 1 ? 'h-28 from-amber-600 to-amber-400 md:h-40' : place === 2 ? 'h-20 from-slate-500 to-slate-300 md:h-28' : 'h-14 from-orange-700 to-orange-400 md:h-20')}>
                    <span className="mt-3 block">{place}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="relative flex flex-wrap items-center justify-between gap-4 px-6 pb-6 md:px-10">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white p-1.5"><QRCode value={publicUrl(`/e/${event.id}`)} size={64} /></div>
          <p className="text-sm text-white/70">Scan to vote<br /><span className="font-bold text-white">MyVoteHub</span></p>
        </div>
        <div className="flex gap-2">
          {revealed > 0 && (
            <button onClick={() => { setRevealed(0); setDrum(0); }} className="flex h-12 items-center gap-2 rounded-xl bg-white/10 px-4 font-bold hover:bg-white/20"><RotateCcw className="h-4 w-4" /> Leaderboard</button>
          )}
          {revealed < 3 && (
            <button onClick={step} disabled={!!drum} className="flex h-12 items-center gap-2 rounded-xl bg-accent-600 px-5 font-bold shadow-lg shadow-accent-600/40 hover:bg-accent-700 disabled:opacity-60">
              <Play className="h-4 w-4" /> {revealed === 0 ? 'Start reveal' : revealed === 1 ? 'Reveal 2nd place' : drum ? 'Drumroll…' : 'Reveal the winner'}
            </button>
          )}
        </div>
        <p className="hidden text-xs text-white/40 md:block">← → change category · Space to reveal</p>
      </footer>
    </div>
  );
}
