import { useEffect, useState, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Moon, Sun, Menu, X, Loader2, LayoutDashboard } from 'lucide-react';
import { useSession } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { cx } from '../ui';
import Logo from './Logo';
import { LIVE, IS_NATIVE, APK_URL } from '../../config';
import { useDB } from '../../data/store';

const LINKS = [
  ['/explore', 'Events'],
  ['/#how', 'How it works'],
  ['/#organisers', 'For organisers'],
];

export default function PublicLayout() {
  const { dark, toggleDark } = useSession();
  const user = useCurrentUser();
  const testMode = useDB((s) => s.settings.testMode);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
    if (!loc.hash) window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-navy-950">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur-xl dark:border-white/5 dark:bg-navy-950/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map(([to, l]) => (
              <NavLink key={to} to={to} className={({ isActive }) => cx('rounded-xl px-3 py-2 text-sm font-semibold transition', isActive && to === '/explore' ? 'text-brand-700 dark:text-brand-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white')}>
                {l}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggleDark} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Toggle dark mode">
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {user ? (
              <Link to="/app" className="hidden h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700 sm:inline-flex">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden h-10 items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 sm:inline-flex">
                  Sign in
                </Link>
                <Link to="/onboard" className="hidden h-10 items-center rounded-xl bg-accent-600 px-4 text-sm font-semibold text-white shadow-sm shadow-accent-600/30 hover:bg-accent-700 sm:inline-flex">
                  Host an event
                </Link>
              </>
            )}
            <button onClick={() => setOpen((o) => !o)} className="rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 md:hidden" aria-label="Menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="animate-fade-in border-t border-slate-100 px-4 py-3 dark:border-white/5 md:hidden">
            {LINKS.map(([to, l]) => (
              <Link key={to} to={to} className="block rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5">
                {l}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link to={user ? '/app' : '/login'} className="flex h-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-800 dark:bg-white/10 dark:text-white">
                {user ? 'Dashboard' : 'Sign in'}
              </Link>
              <Link to="/onboard" className="flex h-11 items-center justify-center rounded-xl bg-accent-600 text-sm font-semibold text-white">
                Host an event
              </Link>
            </div>
          </div>
        )}
      </header>
      <main className="flex-1" key={loc.pathname}>
        <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-navy-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-slate-500">Secure voting for awards, pageants, reality shows and campus polls. Pay with MoMo or card.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <Link to="/explore">Events</Link>
            <Link to="/onboard">Host an event</Link>
            <Link to="/login">Organiser sign in</Link>
            {LIVE && !IS_NATIVE && <a href={APK_URL} className="text-accent-600">Get the Android app</a>}
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} MyVoteHub{!LIVE ? ' · Demo build — payments are simulated' : testMode ? ' · Test mode — no real money is charged' : ''}</p>
        </div>
      </footer>
    </div>
  );
}
