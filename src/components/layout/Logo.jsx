import { useId } from 'react';
import { cx } from '../ui';

export function LogoMark({ className = 'h-10 w-10' }) {
  const gid = `lg-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d43d8" />
          <stop offset="1" stopColor="#3b74f6" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="26" fill={`url(#${gid})`} />
      <rect x="22" y="50" width="56" height="30" rx="7" fill="#fff" />
      <rect x="34" y="20" width="32" height="38" rx="5" fill="#fff" opacity=".92" transform="rotate(-8 50 39)" />
      <path d="M38 38 l7 7 l14 -15" fill="none" stroke="#e11d48" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" transform="rotate(-8 50 39)" />
      <rect x="34" y="57" width="32" height="5" rx="2.5" fill="#1d43d8" opacity=".35" />
    </svg>
  );
}

export default function Logo({ compact, dark, className }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark className="h-9 w-9 shrink-0" />
      {!compact && (
        <div className="min-w-0 leading-none">
          <p className={cx('truncate text-lg font-extrabold tracking-tight', dark ? 'text-white' : 'text-slate-900 dark:text-white')}>
            MyVote<span className="text-accent-600 dark:text-accent-500">Hub</span>
          </p>
          <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Events · Votes · Results</p>
        </div>
      )}
    </div>
  );
}
