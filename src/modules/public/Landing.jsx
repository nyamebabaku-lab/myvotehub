import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Smartphone, Gavel, UserX, BarChart3, Wallet, Building2, Trophy, Sparkles, Zap, CheckCircle2, Search } from 'lucide-react';
import { useState } from 'react';
import { useDB, publicVotes } from '../../data/store';
import { LIVE } from '../../config';
import { compactNum, money } from '../../lib/format';
import { isPublic, eventPhase } from '../../lib/voting';
import EventCard from '../../components/EventCard';
import { NomineePhoto } from '../../components/event';

function HeroBoard() {
  // A live mini-leaderboard from the busiest live event, for the hero.
  const events = useDB((s) => s.events);
  const votes = useDB(publicVotes);
  const nominees = useDB((s) => s.nominees);
  const ev = events.find((e) => e.id === 'evt_sma26') || events.find((e) => eventPhase(e) === 'live');
  if (!ev) return null;
  const cat = useDB.getState().categories.find((c) => c.eventId === ev.id);
  const tally = {};
  votes.forEach((v) => v.categoryId === cat?.id && !v.void && (tally[v.nomineeId] = (tally[v.nomineeId] || 0) + v.qty));
  const rows = nominees.filter((n) => n.categoryId === cat?.id).sort((a, b) => (tally[b.id] || 0) - (tally[a.id] || 0)).slice(0, 4);
  const top = tally[rows[0]?.id] || 1;
  return (
    <div className="relative animate-float">
      <div className="absolute -inset-4 rounded-[2rem] bg-white/10 blur-2xl" />
      <div className="relative rounded-3xl border border-white/15 bg-white/95 p-5 shadow-2xl dark:bg-navy-900/95">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-accent-600">● Live now</p>
            <p className="font-extrabold text-slate-900 dark:text-white">{cat?.name}</p>
            <p className="text-xs text-slate-500">{ev.title}</p>
          </div>
          <Trophy className="h-8 w-8 text-amber-500" />
        </div>
        <div className="mt-4 space-y-3">
          {rows.map((n, i) => (
            <div key={n.id} className="flex items-center gap-3">
              <span className="w-4 text-sm font-extrabold text-slate-400">{i + 1}</span>
              <NomineePhoto nominee={n} className="h-10 w-10" rounded="rounded-xl" text="text-xs" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{n.name}</span>
                  <span className="font-bold tabular-nums text-slate-900 dark:text-white">{compactNum(tally[n.id] || 0)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div className="h-full origin-left animate-bar-grow rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${((tally[n.id] || 0) / top) * 100}%`, animationDelay: `${i * 120}ms` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <Link to={`/e/${ev.id}`} className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-600 text-sm font-bold text-white shadow-lg shadow-accent-600/30 hover:bg-accent-700">
          Vote now <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

const FEATURES = [
  [Smartphone, 'Paid or free voting', 'Sell vote bundles via MoMo and card, or run free polls with one verified vote per phone.'],
  [Gavel, 'Secret judges', 'Judges score in private on your criteria. Scores stay sealed until you release results.'],
  [BarChart3, 'Weighted results', 'Combine public votes and judges any way you like — 70/30, 50/50 or votes only.'],
  [UserX, 'Evictions & rounds', 'Weekly rounds with automatic or manual evictions for reality shows.'],
  [Wallet, 'Wallet & payouts', 'Watch revenue land in real time and withdraw to MoMo or bank in a tap.'],
  [ShieldCheck, 'Fraud protection', 'OTP checks, burst detection and one-click voiding keep results clean.'],
];

export default function Landing() {
  const events = useDB((s) => s.events);
  const votes = useDB(publicVotes);
  const companies = useDB((s) => s.companies);
  const payments = useDB((s) => s.payments);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const pub = events.filter(isPublic);
  const live = pub.filter((e) => eventPhase(e) === 'live');
  const totalVotes = votes.reduce((a, v) => a + (v.void ? 0 : v.qty), 0);
  const raised = payments.reduce((a, p) => a + (p.status === 'success' ? p.amount : 0), 0);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-brand-900 to-brand-700 text-white">
        <div className="hero-glow absolute inset-0" />
        <div className="cover-pattern absolute inset-0 opacity-[.07]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-accent-400" /> {live.length} events live right now
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Every vote <span className="relative whitespace-nowrap text-accent-400">counts.<svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" preserveAspectRatio="none"><path d="M2 9 Q100 -2 198 8" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" /></svg></span>
              <br />
              Every result <span className="text-sky-300">trusted.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-brand-100">Vote for your favourite artistes, queens and housemates in seconds — or run your own awards, pageant or reality show with judges, evictions and instant payouts.</p>
            <form
              className="mt-8 flex max-w-lg gap-2 rounded-2xl bg-white p-1.5 shadow-2xl"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/explore${q ? `?q=${encodeURIComponent(q)}` : ''}`);
              }}
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an event or nominee code…" className="h-12 w-full rounded-xl pl-9 pr-3 text-sm text-slate-800 outline-none" />
              </div>
              <button className="h-12 rounded-xl bg-accent-600 px-5 text-sm font-bold text-white hover:bg-accent-700">Search</button>
            </form>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-6">
              {[[compactNum(totalVotes), 'votes cast'], [pub.length, 'public events'], [companies.filter((c) => c.status === 'active').length, 'organisers']].map(([v, l]) => (
                <div key={l}>
                  <p className="text-3xl font-extrabold">{v}</p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-200">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mx-auto w-full max-w-sm lg:max-w-none">
            <HeroBoard />
          </div>
        </div>
      </section>

      {/* Live events */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent-600">Happening now</p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Live & upcoming events</h2>
          </div>
          <Link to="/explore" className="hidden items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-700 sm:flex">
            All events <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pub.filter((e) => ['live', 'upcoming'].includes(eventPhase(e))).slice(0, 8).map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-slate-50 py-16 dark:bg-navy-900/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-accent-600">For voters</p>
          <h2 className="mt-1 text-center text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Vote in three taps</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              [Search, 'Find your nominee', 'Open an event, pick a category, or search by nominee code.'],
              [Zap, 'Choose your votes', 'Pick a bundle — or cast your free vote after a quick phone check.'],
              [CheckCircle2, 'Pay & done', 'Approve the MoMo prompt or pay by card. Votes count instantly.'],
            ].map(([Icon, t, d], i) => (
              <div key={t} className="card relative p-6">
                <span className="absolute right-5 top-4 text-5xl font-black text-slate-100 dark:text-white/5">{i + 1}</span>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-extrabold text-slate-900 dark:text-white">{t}</h3>
                <p className="mt-1 text-sm text-slate-500">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Organisers */}
      <section id="organisers" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent-600">For organisers</p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Run your whole event from one dashboard</h2>
            <p className="mt-3 text-slate-500">Award schemes, pageants, reality shows and school polls. Onboard your company, build your event in minutes and get paid straight to MoMo or bank.</p>
            <div className="mt-6 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-200">{LIVE ? 'Get paid fast' : 'Raised for organisers'}</p>
              <p className="mt-1 text-3xl font-extrabold">{LIVE ? 'MoMo & bank payouts' : money(raised)}</p>
              <p className="mt-1 text-sm text-brand-100">Simple pricing: a small commission per paid vote. No setup fees.</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/onboard" className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent-600 px-5 text-sm font-bold text-white shadow-lg shadow-accent-600/30 hover:bg-accent-700">
                <Building2 className="h-4 w-4" /> Onboard your company
              </Link>
              <Link to="/login" className="inline-flex h-12 items-center rounded-xl px-5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:ring-white/10">
                {LIVE ? 'Sign in' : 'Try the demo'}
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(([Icon, t, d]) => (
              <div key={t} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-extrabold text-slate-900 dark:text-white">{t}</h3>
                <p className="mt-1 text-sm text-slate-500">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
