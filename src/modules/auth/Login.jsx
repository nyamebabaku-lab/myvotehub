import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Building2, Gavel, ArrowRight, Vote } from 'lucide-react';
import { useDB, useSession } from '../../data/store';
import { Avatar, Button, Field, Input, toast } from '../../components/ui';
import Logo from '../../components/layout/Logo';

const GROUPS = [
  ['admin', 'Super Admin', ShieldCheck, 'Companies, approvals, payouts, commission'],
  ['organiser', 'Event organisers', Building2, 'Build events, judges, evictions, wallet'],
  ['judge', 'Judges', Gavel, 'Secret scoring sheets'],
];

export default function Login() {
  const users = useDB((s) => s.users);
  const companies = useDB((s) => s.companies);
  const login = useSession((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const go = (u) => {
    login(u.id);
    toast.success(`Welcome, ${u.name.split(' ')[0]}`);
    navigate('/app');
  };
  const submit = (e) => {
    e.preventDefault();
    const u = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u || u.password !== password) return toast.error('Wrong email or password', 'Demo accounts use the password demo123');
    if (u.status === 'disabled') return toast.error('Account disabled', 'Contact your organiser');
    go(u);
  };

  return (
    <div className="grid min-h-screen bg-white dark:bg-navy-950 lg:grid-cols-[minmax(0,1fr)_1.1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-navy-950 via-brand-900 to-brand-700 p-12 text-white lg:flex lg:flex-col">
        <div className="hero-glow absolute inset-0" />
        <div className="cover-pattern absolute inset-0 opacity-[.07]" />
        <Link to="/" className="relative"><Logo dark /></Link>
        <div className="relative mt-auto">
          <Vote className="h-12 w-12 text-accent-400" />
          <h1 className="mt-6 text-4xl font-extrabold leading-tight">The control room for<br />awards, pageants &amp; reality shows.</h1>
          <p className="mt-4 max-w-md text-brand-100">Onboard companies, sell votes over MoMo and card, let judges score in secret, run evictions and pay organisers — all from one place.</p>
        </div>
      </div>
      <div className="flex flex-col px-4 py-8 sm:px-10 lg:py-12">
        <Link to="/" className="lg:hidden"><Logo /></Link>
        <div className="mx-auto mt-8 w-full max-w-xl lg:mt-0">
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Pick a demo account below, or use an email and password.</p>
          <div className="mt-6 space-y-5">
            {GROUPS.map(([role, label, Icon, desc]) => (
              <div key={role}>
                <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><Icon className="h-3.5 w-3.5" /> {label} <span className="font-medium normal-case tracking-normal text-slate-400">— {desc}</span></p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {users.filter((u) => u.role === role).map((u) => (
                    <button key={u.id} onClick={() => go(u)} className="group flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/50 dark:border-white/10 dark:hover:bg-white/5">
                      <Avatar name={u.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800 dark:text-white">{u.name}</p>
                        <p className="truncate text-xs text-slate-500">{u.role === 'admin' ? u.title : `${companies.find((c) => c.id === u.companyId)?.name} · ${u.title}`}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="my-8 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /> or <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          </div>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="demo123" /></Field>
            <Button type="submit" size="lg" className="sm:col-span-2">Sign in</Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            New organiser? <Link to="/onboard" className="font-bold text-accent-600 hover:underline">Onboard your company</Link> · Just voting? <Link to="/explore" className="font-bold text-brand-600 hover:underline">Browse events</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
