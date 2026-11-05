import { Link } from 'react-router-dom';
import { Vote, ShieldCheck } from 'lucide-react';
import Logo from '../../components/layout/Logo';
import { ADMIN_APP } from '../../config';

/** Two-column sign-in frame: brand panel on wide screens, form on the right. */
export default function AuthLayout({ children }) {
  const Icon = ADMIN_APP ? ShieldCheck : Vote;
  return (
    <div className="grid min-h-screen bg-white dark:bg-navy-950 lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-navy-950 via-brand-900 to-brand-700 p-12 text-white lg:flex lg:flex-col">
        <div className="hero-glow absolute inset-0" />
        <div className="cover-pattern absolute inset-0 opacity-[.07]" />
        <Link to="/" className="relative"><Logo dark /></Link>
        <div className="relative mt-auto">
          <Icon className="h-12 w-12 text-accent-400" />
          {ADMIN_APP ? (
            <>
              <h1 className="mt-6 text-4xl font-extrabold leading-tight">MyVoteHub Admin</h1>
              <p className="mt-4 max-w-md text-brand-100">Approve companies, organisers, judges and admins. Review events, pay organisers and keep every vote clean.</p>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-4xl font-extrabold leading-tight">Run your awards, pageant<br />or reality show.</h1>
              <p className="mt-4 max-w-md text-brand-100">Build events, sell votes over MoMo and card, let judges score in secret, run evictions and get paid.</p>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col px-4 py-8 sm:px-10 lg:justify-center lg:py-12">
        <Link to="/" className="lg:hidden"><Logo /></Link>
        <div className="mx-auto mt-8 w-full max-w-md lg:mt-0">{children}</div>
      </div>
    </div>
  );
}
