import { useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useDB, useSession } from './data/store';
import { useCurrentUser } from './data/selectors';
import { canAccess } from './lib/nav';
import { setCurrencySymbol } from './lib/format';
import { Toaster, EmptyState, Card } from './components/ui';
import AppShell from './components/layout/AppShell';
import PublicLayout from './components/layout/PublicLayout';
import Landing from './modules/public/Landing';

// Pages load on demand so the first visit is light on slow connections; the service worker caches them all for offline use.
const Explore = lazy(() => import('./modules/public/Explore'));
const EventPage = lazy(() => import('./modules/public/EventPage'));
const NomineePage = lazy(() => import('./modules/public/NomineePage'));
const PublicResults = lazy(() => import('./modules/public/PublicResults'));
const Receipt = lazy(() => import('./modules/public/Receipt'));
const Reveal = lazy(() => import('./modules/public/Reveal'));
const Onboard = lazy(() => import('./modules/public/Onboard'));
const Login = lazy(() => import('./modules/auth/Login'));
const Dashboard = lazy(() => import('./modules/dashboard/Dashboard'));
const Events = lazy(() => import('./modules/organiser/Events'));
const EventWizard = lazy(() => import('./modules/organiser/EventWizard'));
const EventManage = lazy(() => import('./modules/organiser/EventManage'));
const Wallet = lazy(() => import('./modules/organiser/Wallet'));
const Team = lazy(() => import('./modules/organiser/Team'));
const CompanyProfile = lazy(() => import('./modules/organiser/CompanyProfile'));
const Transactions = lazy(() => import('./modules/admin/Transactions'));
const Companies = lazy(() => import('./modules/admin/Companies'));
const Approvals = lazy(() => import('./modules/admin/Approvals'));
const Withdrawals = lazy(() => import('./modules/admin/Withdrawals'));
const Audit = lazy(() => import('./modules/admin/Audit'));
const Settings = lazy(() => import('./modules/admin/Settings'));
const Notifications = lazy(() => import('./modules/dashboard/Notifications'));
const Judging = lazy(() => import('./modules/judge/Judging'));
const ScoreSheet = lazy(() => import('./modules/judge/ScoreSheet'));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
    </div>
  );
}

function Guard({ k, children }) {
  const user = useCurrentUser();
  if (!canAccess(user.role, k))
    return (
      <Card>
        <EmptyState icon={ShieldAlert} title="No access" text="Your role cannot open this page." />
      </Card>
    );
  return children;
}

function RequireUser({ children }) {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const dark = useSession((s) => s.dark);
  const currency = useDB((s) => s.settings.currency);
  setCurrencySymbol(currency);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const g = (k, el) => <Guard k={k}>{el}</Guard>;
  return (
    <HashRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/e/:eventId" element={<EventPage />} />
            <Route path="/e/:eventId/n/:nomineeId" element={<NomineePage />} />
            <Route path="/e/:eventId/results" element={<PublicResults />} />
            <Route path="/receipt/:ref" element={<Receipt />} />
            <Route path="/onboard" element={<Onboard />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/reveal/:eventId" element={<Reveal />} />
          <Route
            path="/app"
            element={
              <RequireUser>
                <AppShell />
              </RequireUser>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="events" element={g('events', <Events />)} />
            <Route path="events/new" element={g('events', <EventWizard />)} />
            <Route path="events/:id" element={g('events', <EventManage />)} />
            <Route path="events/:id/edit" element={g('events', <EventWizard />)} />
            <Route path="wallet" element={g('wallet', <Wallet />)} />
            <Route path="team" element={g('team', <Team />)} />
            <Route path="company" element={g('company', <CompanyProfile />)} />
            <Route path="transactions" element={g('transactions', <Transactions />)} />
            <Route path="companies" element={g('companies', <Companies />)} />
            <Route path="approvals" element={g('approvals', <Approvals />)} />
            <Route path="withdrawals" element={g('withdrawals', <Withdrawals />)} />
            <Route path="audit" element={g('audit', <Audit />)} />
            <Route path="settings" element={g('settings', <Settings />)} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="judging" element={g('judging', <Judging />)} />
            <Route path="judging/:eventId" element={g('judging', <ScoreSheet />)} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </HashRouter>
  );
}
