import { useEffect, useState, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Moon, Sun, Bell, LogOut, Menu, X, ChevronsLeft, ChevronsRight, Repeat, ChevronDown, Loader2, Globe } from 'lucide-react';
import { useDB, useSession } from '../../data/store';
import { useCurrentUser, notificationsFor } from '../../data/selectors';
import { navFor, navItem, MOBILE_TABS, ROLES } from '../../lib/nav';
import { Avatar, Badge, cx } from '../ui';
import Logo from './Logo';

function SidebarNav({ role, collapsed, onNavigate }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
      {navFor(role).map((g) => (
        <div key={g.group}>
          {!collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">{g.group}</p>}
          <div className="space-y-1">
            {g.items.map((it) => (
              <NavLink
                key={it.key}
                to={it.path}
                end={it.path === '/app'}
                onClick={onNavigate}
                title={collapsed ? it.label : undefined}
                className={({ isActive }) => cx('nav-link', isActive && 'active', collapsed && 'justify-center px-0')}
              >
                <it.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{it.label}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function OrgBadge({ collapsed, user }) {
  const company = useDB((s) => s.companies.find((c) => c.id === user.companyId));
  if (collapsed) return null;
  return (
    <div className="mx-3 mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white shadow-lg shadow-brand-900/40">
      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-200">{user.role === 'admin' ? 'Platform' : 'Organisation'}</p>
      <p className="mt-1 truncate text-sm font-bold">{user.role === 'admin' ? 'MyVoteHub HQ' : company?.name}</p>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-brand-100">
        <span className={cx('h-1.5 w-1.5 rounded-full', company?.status === 'pending' ? 'bg-amber-300' : 'bg-emerald-300')} />
        {user.role === 'admin' ? 'All systems normal' : company?.status === 'pending' ? 'Awaiting verification' : 'Verified organiser'}
      </div>
    </div>
  );
}

export default function AppShell() {
  const user = useCurrentUser();
  const { dark, toggleDark, logout, sidebarCollapsed, toggleSidebar } = useSession();
  const notifications = useDB((s) => s.notifications);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  if (!user) return null;
  const unread = notificationsFor(user, notifications).filter((n) => !n.read).length;
  const tabs = (MOBILE_TABS[user.role] || ['dashboard']).map((k) => navItem(user.role, k)).filter(Boolean);
  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-950">
      <aside className={cx('no-print fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy-900 transition-all lg:flex', sidebarCollapsed ? 'w-20' : 'w-72')}>
        <Link to="/" className={cx('flex h-20 items-center px-5', sidebarCollapsed && 'justify-center px-0')}>
          <Logo compact={sidebarCollapsed} dark />
        </Link>
        <OrgBadge collapsed={sidebarCollapsed} user={user} />
        <SidebarNav role={user.role} collapsed={sidebarCollapsed} />
        <button onClick={toggleSidebar} className="m-3 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-white">
          {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
        </button>
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-[85%] max-w-xs animate-slide-in flex-col bg-navy-900">
            <div className="flex h-20 items-center justify-between px-5">
              <Logo dark />
              <button onClick={() => setMobileOpen(false)} className="rounded-xl p-2 text-slate-300 hover:bg-white/10" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <OrgBadge user={user} />
            <SidebarNav role={user.role} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className={cx('transition-all', sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72')}>
        <header className="no-print sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl dark:border-white/5 dark:bg-navy-950/85">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <Badge tone={user.role === 'admin' ? 'red' : user.role === 'judge' ? 'violet' : 'blue'} className="hidden sm:inline-flex">
              {ROLES[user.role].label}
            </Badge>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <Link to="/explore" className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 md:flex">
                <Globe className="h-4 w-4" /> Public site
              </Link>
              <button onClick={toggleDark} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Toggle dark mode">
                {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button onClick={() => navigate('/app/notifications')} className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-navy-950">{unread}</span>}
              </button>
              <div className="relative">
                <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-slate-100 dark:hover:bg-white/10">
                  <Avatar name={user.name} size="sm" />
                  <div className="hidden text-left sm:block">
                    <p className="max-w-[140px] truncate text-sm font-semibold leading-tight text-slate-800 dark:text-white">{user.name}</p>
                    <p className="text-[11px] leading-tight text-slate-500">{user.title}</p>
                  </div>
                  <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-64 animate-scale-in overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lift dark:border-white/10 dark:bg-navy-900">
                      <div className="border-b border-slate-100 p-4 dark:border-white/5">
                        <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                      <Link to="/explore" className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5 md:hidden">
                        <Globe className="h-4 w-4" /> Public site
                      </Link>
                      <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5">
                        <Repeat className="h-4 w-4" /> Switch account
                      </button>
                      <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-500/10">
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] animate-fade-in px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12" key={loc.pathname}>
          <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xl safe-bottom dark:border-white/10 dark:bg-navy-900/95 lg:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((t) => (
            <NavLink key={t.key} to={t.path} end={t.path === '/app'} className={({ isActive }) => cx('flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold', isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400')}>
              <t.icon className="h-5 w-5" />
              <span className="max-w-full truncate px-1">{t.label.split(' ')[0]}</span>
            </NavLink>
          ))}
          <button onClick={() => setMobileOpen(true)} className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-slate-400">
            <Menu className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
