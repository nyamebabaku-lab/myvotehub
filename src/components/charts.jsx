// Shared chart styling. Blue/red pair validated for colour-blind separation and contrast in both themes.
import { useSession } from '../data/store';

export function useChartTheme() {
  const dark = useSession((s) => s.dark);
  return dark
    ? { primary: '#3b74f6', secondary: '#f52d52', grid: 'rgba(255,255,255,.06)', axis: '#64748b', surface: '#0a1330', soft: '#3b74f62e' }
    : { primary: '#2556eb', secondary: '#e11d48', grid: '#eef2f7', axis: '#94a3b8', surface: '#ffffff', soft: '#2556eb1f' };
}

export const axisProps = (t) => ({ stroke: t.axis, fontSize: 11, tickLine: false, axisLine: false });

export function ChartTooltip({ active, payload, label, format = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-lift dark:border-white/10 dark:bg-navy-800">
      <p className="mb-1 font-semibold text-slate-800 dark:text-white">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-slate-900 dark:text-white">{format(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
