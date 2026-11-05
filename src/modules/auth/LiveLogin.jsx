// Live sign-in. Main app: organisers, team members and judges. Admin app: MyVoteHub staff (with "Request admin access").
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';
import { ADMIN_APP, IS_NATIVE, APK_URL, ADMIN_APK_URL } from '../../config';
import { signIn, enter, requestAdmin } from '../../lib/accounts';
import { Button, Field, Input, Tabs, toast } from '../../components/ui';
import AuthLayout from './AuthLayout';

export default function LiveLogin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('in');
  const [f, setF] = useState({ email: '', password: '', name: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const run = async (fn) => {
    setBusy(true);
    try {
      const p = await fn();
      await enter(p);
      navigate('/app');
    } catch (e) {
      toast.error(tab === 'in' ? 'Could not sign in' : 'Could not create the account', e.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e) => {
    e.preventDefault();
    if (tab === 'in') return run(() => signIn(f.email, f.password));
    if (!f.name.trim()) return toast.error('Enter your full name');
    if (f.password.length < 6) return toast.error('Password too short', 'Use at least 6 characters');
    if (f.password !== f.confirm) return toast.error('Passwords do not match');
    run(() => requestAdmin({ email: f.email, password: f.password, name: f.name.trim() }));
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">{ADMIN_APP ? 'Admin sign in' : 'Sign in'}</h2>
      <p className="mt-1 text-sm text-slate-500">{ADMIN_APP ? 'For MyVoteHub staff. New admins need approval from a Super Admin.' : 'For event organisers, their team and judges. Voters don’t need an account.'}</p>
      {ADMIN_APP && <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Request admin access' }]} />}
      <form onSubmit={submit} className="mt-6 space-y-4">
        {tab === 'up' && <Field label="Full name"><Input value={f.name} onChange={set('name')} autoComplete="name" /></Field>}
        <Field label="Email"><Input type="email" required value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@company.com" /></Field>
        <Field label="Password"><Input type="password" required value={f.password} onChange={set('password')} autoComplete={tab === 'in' ? 'current-password' : 'new-password'} /></Field>
        {tab === 'up' && <Field label="Confirm password"><Input type="password" required value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>}
        <Button type="submit" size="lg" className="w-full" icon={tab === 'in' ? LogIn : ShieldCheck} disabled={busy}>
          {busy ? 'Please wait…' : tab === 'in' ? 'Sign in' : 'Request access'}
        </Button>
      </form>
      {!ADMIN_APP && (
        <div className="mt-8 rounded-2xl bg-slate-50 p-5 text-center dark:bg-white/5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">New to MyVoteHub?</p>
          <Link to="/signup"><Button variant="danger" className="mt-3 w-full">Create account</Button></Link>
        </div>
      )}
      {!IS_NATIVE && (
        <a href={ADMIN_APP ? ADMIN_APK_URL : APK_URL} className="mt-6 block text-center text-sm font-bold text-brand-600 hover:underline">
          Download the {ADMIN_APP ? 'MyVoteHub Admin' : 'MyVoteHub'} app for Android
        </a>
      )}
      <p className="mt-6 text-center text-xs text-slate-400">Forgot your password? {ADMIN_APP ? 'Ask a Super Admin.' : 'Contact MyVoteHub support.'}</p>
    </AuthLayout>
  );
}
