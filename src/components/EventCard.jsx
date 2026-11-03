import { Link } from 'react-router-dom';
import { CalendarDays, Users, Flame } from 'lucide-react';
import { useDB } from '../data/store';
import { compactNum, fmtDate } from '../lib/format';
import { Cover, PhaseBadge, TYPE } from './event';

export default function EventCard({ event, to }) {
  const company = useDB((s) => s.companies.find((c) => c.id === event.companyId));
  const nominees = useDB((s) => s.nominees.filter((n) => n.eventId === event.id).length);
  const votes = useDB((s) => s.votes.reduce((a, v) => (v.eventId === event.id && !v.void ? a + v.qty : a), 0));
  return (
    <Link to={to || `/e/${event.id}`} className="group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
      <Cover event={event} className="h-36">
        <div className="absolute left-3 top-3 flex gap-1.5">
          <PhaseBadge event={event} className="bg-white/95 dark:bg-navy-900/90" />
        </div>
        <span className="absolute bottom-3 left-3 rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{TYPE[event.type]?.label}</span>
      </Cover>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">{company?.name}</p>
        <h3 className="mt-1 line-clamp-2 font-extrabold leading-snug text-slate-900 group-hover:text-brand-700 dark:text-white">{event.title}</h3>
        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{event.tagline}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs font-medium text-slate-500">
          <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {fmtDate(event.endAt, 'dd MMM')}</span>
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {nominees} nominees</span>
          <span className="flex items-center gap-1 text-accent-600"><Flame className="h-3.5 w-3.5" /> {compactNum(votes)} votes</span>
        </div>
      </div>
    </Link>
  );
}
