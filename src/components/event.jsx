// Building blocks shared by public and admin event screens.
import { useEffect, useRef, useState } from 'react';
import { Trophy, Crown, Tv, Vote, ImagePlus, Trash2 } from 'lucide-react';
import { Badge, cx } from './ui';
import { initials } from '../lib/format';
import { eventPhase, PHASE } from '../lib/voting';

export const COVERS = {
  blue: 'from-brand-800 via-brand-600 to-sky-500',
  red: 'from-accent-800 via-accent-600 to-rose-400',
  night: 'from-navy-950 via-brand-900 to-accent-700',
  gold: 'from-amber-700 via-amber-500 to-yellow-300',
  teal: 'from-teal-800 via-teal-600 to-emerald-400',
  violet: 'from-violet-800 via-violet-600 to-fuchsia-400',
};
export const TYPE = {
  awards: { label: 'Awards', icon: Trophy },
  pageant: { label: 'Pageant', icon: Crown },
  reality: { label: 'Reality show', icon: Tv },
  poll: { label: 'Poll / Contest', icon: Vote },
};

export function Cover({ event, className, children, iconSize = 'h-16 w-16' }) {
  const Icon = TYPE[event.type]?.icon || Trophy;
  return (
    <div className={cx('relative overflow-hidden bg-gradient-to-br', COVERS[event.cover] || COVERS.blue, className)}>
      {event.image ? (
        <img src={event.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <div className="cover-pattern absolute inset-0 opacity-30" />
          <Icon className={cx('absolute -bottom-3 -right-3 rotate-12 text-white/20', iconSize)} strokeWidth={1.4} />
        </>
      )}
      {children}
    </div>
  );
}

export function PhaseBadge({ event, className }) {
  const p = eventPhase(event);
  const meta = PHASE[p];
  return (
    <Badge tone={meta.tone} dot={p === 'live'} className={cx(p === 'live' && 'animate-pulse-soft', className)}>
      {meta.label}
    </Badge>
  );
}

const GRADS = ['from-brand-600 to-sky-400', 'from-accent-600 to-orange-400', 'from-violet-600 to-fuchsia-400', 'from-teal-600 to-emerald-400', 'from-amber-500 to-yellow-300', 'from-navy-800 to-brand-600', 'from-rose-600 to-pink-400', 'from-sky-600 to-cyan-300'];
const strip = (name) => name.replace(/[“”"]/g, '').replace(/\s+—.*$/, '');

export function NomineePhoto({ nominee, className, rounded = 'rounded-2xl', text = 'text-2xl' }) {
  const seed = nominee.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <div className={cx('relative shrink-0 overflow-hidden bg-gradient-to-br', GRADS[seed % GRADS.length], rounded, className)}>
      {nominee.photo ? (
        <img src={nominee.photo} alt={nominee.name} className="h-full w-full object-cover" />
      ) : (
        <div className={cx('flex h-full w-full items-center justify-center font-extrabold text-white/95', text)}>{initials(strip(nominee.name))}</div>
      )}
      {nominee.status === 'evicted' && (
        <div className="absolute inset-0 flex items-center justify-center bg-navy-950/55">
          <span className="-rotate-12 rounded-md border-2 border-accent-500 bg-accent-600/90 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">Evicted</span>
        </div>
      )}
    </div>
  );
}

export function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(target).getTime() - now);
  return { ms, d: Math.floor(ms / 86400000), h: Math.floor(ms / 3600000) % 24, m: Math.floor(ms / 60000) % 60, s: Math.floor(ms / 1000) % 60 };
}

export function Countdown({ target, label = 'Voting closes in', light }) {
  const { d, h, m, s, ms } = useCountdown(target);
  if (!ms) return null;
  const cell = (v, l) => (
    <div className={cx('min-w-[52px] rounded-xl px-2 py-1.5 text-center', light ? 'bg-white/15 text-white backdrop-blur' : 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300')}>
      <p className="text-lg font-extrabold tabular-nums leading-none">{String(v).padStart(2, '0')}</p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest opacity-80">{l}</p>
    </div>
  );
  return (
    <div>
      <p className={cx('mb-1.5 text-[11px] font-bold uppercase tracking-widest', light ? 'text-white/80' : 'text-slate-500')}>{label}</p>
      <div className="flex gap-1.5">
        {cell(d, 'days')}
        {cell(h, 'hrs')}
        {cell(m, 'min')}
        {cell(s, 'sec')}
      </div>
    </div>
  );
}

/** Shrinks a picked image to a small JPEG data URL so it fits in browser storage. */
export function resizeImage(file, max = 480) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function ImagePicker({ value, onChange, max = 480, label = 'Upload image', className }) {
  const ref = useRef(null);
  return (
    <div className={cx('flex items-center gap-3', className)}>
      {value && <img src={value} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-slate-200" />}
      <button type="button" onClick={() => ref.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300">
        <ImagePlus className="h-4 w-4" /> {value ? 'Change' : label}
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="rounded-xl p-2 text-slate-400 hover:bg-accent-50 hover:text-accent-600" aria-label="Remove image">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange(await resizeImage(f, max));
          e.target.value = '';
        }}
      />
    </div>
  );
}
