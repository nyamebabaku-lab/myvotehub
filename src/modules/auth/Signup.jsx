// Main app sign-up: register a company (organiser) or join one with its code (team member or judge).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Users, Gavel, ArrowLeft, Search, CheckCircle2 } from 'lucide-react';
import { companyByCode, joinCompany, enter } from '../../lib/accounts';
import { Button, Field, Input, cx, toast } from '../../components/ui';
import AuthLayout from './AuthLayout';

function Join({ onBack }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ code: '', role: 'organiser', name: '', title: '', phone: '', email: '', password: '', confirm: '' });
  const [company, setCompany] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const look = async () => {
    try {
      const c = await companyByCode(f.code);
      setCompany(c);
      if (!c) toast.error('No company has that code', 'Ask your organiser for the 6-character company code');
    } catch (e) {
      toast.error('Could not check the code', e.message);
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!company) return toast.error('Check the company code first');
    if (!f.name.trim()) return toast.error('Enter your full name');
    if (f.password.length < 6) return toast.error('Password too short', 'Use at least 6 characters');
    if (f.password !== f.confirm) return toast.error('Passwords do not match');
    setBusy(true);
    try {
      await enter(await joinCompany({ ...f, name: f.name.trim() }));
      navigate('/app');
    } catch (err) {
      toast.error('Could not create the account', err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Back</button>
      <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Join your company</h2>
      <Field label="Company code" hint="Your organiser finds it under Team & judges.">
        <div className="flex gap-2">
          <Input value={f.code} onChange={(e) => { setF({ ...f, code: e.target.value.toUpperCase() }); setCompany(null); }} maxLength={8} placeholder="e.g. 7K2QPA" className="font-mono uppercase tracking-widest" />
          <Button variant="soft" icon={Search} onClick={look}>Check</Button>
        </div>
      </Field>
      {company && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {company.name}</p>}
      <div>
        <span className="label">I am a</span>
        <div className="grid grid-cols-2 gap-2">
          {[['organiser', 'Team member', Users], ['judge', 'Judge', Gavel]].map(([k, l, Icon]) => (
            <button key={k} type="button" onClick={() => setF({ ...f, role: k })} className={cx('flex items-center justify-center gap-2 rounded-2xl border-2 p-3 text-sm font-bold', f.role === k ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'border-slate-200 dark:border-white/10')}>
              <Icon className="h-4 w-4" /> {l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
      </div>
      <Field label="Email"><Input type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password"><Input type="password" required value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Confirm"><Input type="password" required value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
      </div>
      <Button type="submit" size="lg" variant="danger" className="w-full" disabled={busy}>{busy ? 'Please wait…' : 'Create account'}</Button>
      <p className="text-center text-xs text-slate-500">MyVoteHub approves every new account before you can sign in to your dashboard.</p>
    </form>
  );
}

export default function Signup() {
  const [mode, setMode] = useState(null);
  return (
    <AuthLayout>
      {mode === 'join' ? (
        <Join onBack={() => setMode(null)} />
      ) : (
        <>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Create account</h2>
          <p className="mt-1 text-sm text-slate-500">Voters don’t need an account — just open an event and vote.</p>
          <div className="mt-6 space-y-3">
            <Link to="/onboard" className="card flex items-center gap-4 p-5 transition hover:border-brand-300 hover:shadow-lift">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-600 text-white"><Building2 className="h-5 w-5" /></span>
              <span><b className="block text-slate-900 dark:text-white">Register your company</b><span className="text-sm text-slate-500">You run events and want to sell votes</span></span>
            </Link>
            <button type="button" onClick={() => setMode('join')} className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-brand-300 hover:shadow-lift">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white"><Users className="h-5 w-5" /></span>
              <span><b className="block text-slate-900 dark:text-white">Join your company</b><span className="text-sm text-slate-500">You’re a team member or judge with a company code</span></span>
            </button>
          </div>
          <p className="mt-8 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-bold text-brand-600 hover:underline">Sign in</Link></p>
        </>
      )}
    </AuthLayout>
  );
}
