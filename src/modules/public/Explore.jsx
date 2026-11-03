import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { useDB } from '../../data/store';
import { isPublic, eventPhase } from '../../lib/voting';
import EventCard from '../../components/EventCard';
import { SearchInput, EmptyState, Tabs, cx } from '../../components/ui';
import { NomineePhoto, TYPE } from '../../components/event';

export default function Explore() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [phase, setPhase] = useState('all');
  const [type, setType] = useState('all');
  const events = useDB((s) => s.events);
  const companies = useDB((s) => s.companies);
  const nominees = useDB((s) => s.nominees);
  const pub = events.filter(isPublic);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pub.filter((e) => {
      const p = eventPhase(e);
      if (phase === 'live' && p !== 'live') return false;
      if (phase === 'upcoming' && p !== 'upcoming') return false;
      if (phase === 'past' && !['ended', 'closed'].includes(p)) return false;
      if (type !== 'all' && e.type !== type) return false;
      if (!needle) return true;
      const co = companies.find((c) => c.id === e.companyId)?.name || '';
      return `${e.title} ${e.tagline} ${co}`.toLowerCase().includes(needle);
    });
  }, [pub, q, phase, type, companies]);

  // Nominee code or name search jumps straight to the nominee.
  const nomHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 3) return [];
    const ids = new Set(pub.map((e) => e.id));
    return nominees.filter((n) => ids.has(n.eventId) && (n.code.toLowerCase() === needle || n.name.toLowerCase().includes(needle))).slice(0, 6);
  }, [q, nominees, pub]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Explore events</h1>
      <p className="mt-1 text-slate-500">Awards, pageants, reality shows and polls you can vote in.</p>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search events, organisers, nominees or codes (e.g. AOY-01)…" className="lg:w-[420px]" />
        <Tabs value={phase} onChange={setPhase} tabs={[{ value: 'all', label: 'All' }, { value: 'live', label: 'Live' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {[['all', 'All types'], ...Object.entries(TYPE).map(([k, v]) => [k, v.label])].map(([k, l]) => (
            <button key={k} onClick={() => setType(k)} className={cx('whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition', type === k ? 'bg-brand-600 text-white ring-brand-600' : 'text-slate-600 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-white/10')}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {nomHits.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Nominees</p>
          <div className="flex flex-wrap gap-2">
            {nomHits.map((n) => (
              <Link key={n.id} to={`/e/${n.eventId}/n/${n.id}`} className="card flex items-center gap-3 p-2 pr-4 hover:shadow-lift">
                <NomineePhoto nominee={n} className="h-10 w-10" rounded="rounded-xl" text="text-xs" />
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{n.name}</p>
                  <p className="text-xs text-slate-500">{n.code} · {events.find((e) => e.id === n.eventId)?.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
      {!list.length && <EmptyState icon={SearchX} title="No events match" text="Try another search or filter." />}
    </div>
  );
}
