// Live builds: only active accounts of the right kind reach the dashboard; everyone else sees why.
import { Clock, Ban, PowerOff, ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useDB } from '../data/store';
import { useCurrentUser } from '../data/selectors';
import { ADMIN_APP } from '../config';
import { signOut, fetchProfile, enter } from '../lib/accounts';
import { Button, Card, toast } from './ui';
import Logo from './layout/Logo';

function Screen({ icon: Icon, tone, title, text }) {
  const recheck = async () => {
    const p = await fetchProfile();
    await enter(p);
    if (p?.status === 'active') toast.success('Welcome!', 'Your account is approved');
    else toast.info('Still waiting', 'We’ll let you in as soon as MyVoteHub approves your account');
  };
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-navy-950">
      <Logo />
      <Card className="mt-8 w-full max-w-md p-8 text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-7 w-7" /></div>
        <h1 className="mt-5 text-xl font-extrabold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{text}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="secondary" icon={RefreshCw} onClick={recheck}>Check again</Button>
          <Button variant="soft-red" icon={LogOut} onClick={signOut}>Sign out</Button>
        </div>
      </Card>
    </div>
  );
}

export default function AccountGate({ children }) {
  const loaded = useDB((s) => s.loaded);
  const me = useDB((s) => s.me);
  const user = useCurrentUser();
  if (!loaded) return null;
  if (!me) return <Navigate to="/login" replace />;
  if (me.unregistered)
    return <Screen icon={ShieldAlert} tone="bg-amber-100 text-amber-700" title="Finish setting up" text={`${me.email} is signed in but not registered yet. Sign out and create your account again, or ask MyVoteHub support.`} />;
  if ((me.role === 'admin') !== ADMIN_APP)
    return <Screen icon={ShieldAlert} tone="bg-brand-100 text-brand-700" title={ADMIN_APP ? 'Admins only' : 'Use the Admin app'} text={ADMIN_APP ? 'This app is for MyVoteHub staff. Organisers, team members and judges use the MyVoteHub app.' : 'Admin accounts sign in to the MyVoteHub Admin app.'} />;
  const status = me.status;
  if (status === 'pending')
    return <Screen icon={Clock} tone="bg-amber-100 text-amber-700" title="Waiting for approval" text="Thanks for signing up! A MyVoteHub admin will check your details and approve your account. You’ll get in as soon as that happens." />;
  if (status === 'suspended') return <Screen icon={Ban} tone="bg-accent-100 text-accent-700" title="Account suspended" text={me.statusReason || 'Please contact MyVoteHub support.'} />;
  if (status === 'deactivated') return <Screen icon={PowerOff} tone="bg-slate-200 text-slate-600" title="Account deactivated" text={me.statusReason || 'This account is no longer active.'} />;
  const company = useDB.getState().companies.find((c) => c.id === me.companyId);
  if (me.role !== 'admin' && company && company.status !== 'active')
    return <Screen icon={company.status === 'pending' ? Clock : Ban} tone="bg-amber-100 text-amber-700" title={company.status === 'pending' ? 'Company waiting for approval' : `Company ${company.status}`} text={company.statusReason || `${company.name} isn’t active on MyVoteHub right now.`} />;
  if (!user) return null;
  return children;
}
