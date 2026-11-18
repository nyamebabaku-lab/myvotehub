// Forgot password (email code, or ask an admin) and change password.
import { useEffect, useState } from 'react';
import { Mail, KeyRound, LifeBuoy, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { sendResetCode, resetWithCode, requestPasswordHelp, changePassword } from '../lib/accounts';
import { Button, Field, Input, Modal, toast } from './ui';

function PasswordInput({ value, onChange, autoComplete = 'new-password', placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** New password + confirm. Calls onSubmit(password) once both match and are long enough. */
export function NewPasswordFields({ onSubmit, busy, label = 'Save new password' }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error('Password too short', 'Use at least 8 characters');
    if (pw !== again) return toast.error('Passwords do not match');
    onSubmit(pw);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="New password" hint="At least 8 characters"><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <Field label="Type it again"><PasswordInput value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
      <Button type="submit" className="w-full" size="lg" icon={KeyRound} disabled={busy}>{busy ? 'Please wait…' : label}</Button>
    </form>
  );
}

export function ForgotPasswordModal({ open, onClose, email: initial = '', onSignedIn }) {
  const [step, setStep] = useState('email'); // email → code → help-sent
  const [email, setEmail] = useState(initial);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setStep('email');
      setEmail(initial);
      setCode('');
    }
  }, [open, initial]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      if (!/\S+@\S+\.\S+/.test(email)) return toast.error('Enter the email you sign in with');
      try {
        await sendResetCode(email);
        setStep('code');
        toast.success('Check your email', `We sent a reset code to ${email.trim()}`);
      } catch (e) {
        toast.error('Could not send the email', `${e.message}. You can ask MyVoteHub for help instead.`);
      }
    });
  const askAdmin = () =>
    run(async () => {
      if (!/\S+@\S+\.\S+/.test(email)) return toast.error('Enter the email you sign in with');
      try {
        await requestPasswordHelp(email);
        setStep('help-sent');
      } catch (e) {
        toast.error('Could not send the request', e.message);
      }
    });
  const reset = (pw) =>
    run(async () => {
      if (!/^\d{6,10}$/.test(code.trim())) return toast.error('Enter the code from the email');
      try {
        const p = await resetWithCode(email, code, pw);
        toast.success('Password changed', 'You are signed in');
        onClose();
        onSignedIn?.(p);
      } catch (e) {
        toast.error('Could not reset the password', /token|otp|expired|invalid/i.test(e.message) ? 'The code is wrong or has expired. Ask for a new one.' : e.message);
      }
    });

  return (
    <Modal open={open} onClose={onClose} title="Forgot your password?" subtitle={step === 'code' ? `Enter the code we emailed to ${email.trim()}` : 'We’ll help you get back in.'} size="sm">
      {step === 'email' && (
        <div className="space-y-4">
          <Field label="Your sign-in email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" /></Field>
          <Button className="w-full" size="lg" icon={Mail} onClick={send} disabled={busy}>Email me a reset code</Button>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
            <p className="font-bold text-slate-800 dark:text-white">No access to that email?</p>
            <p className="mt-1">Ask MyVoteHub. An admin will check it’s you and give you a temporary password.</p>
            <Button variant="secondary" size="sm" className="mt-3" icon={LifeBuoy} onClick={askAdmin} disabled={busy}>Ask MyVoteHub for help</Button>
          </div>
        </div>
      )}
      {step === 'code' && (
        <div className="space-y-4">
          <Field label="Reset code" hint="Check your spam folder if it hasn’t arrived.">
            <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={10} placeholder="12345678" className="text-center text-lg font-bold tracking-[.4em]" />
          </Field>
          <NewPasswordFields onSubmit={reset} busy={busy} label="Reset password" />
          <button type="button" onClick={() => setStep('email')} className="w-full text-center text-xs font-bold text-brand-600">Use a different email or ask for help</button>
        </div>
      )}
      {step === 'help-sent' && (
        <div className="flex flex-col items-center py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="mt-3 font-extrabold text-slate-900 dark:text-white">Request sent</p>
          <p className="mt-1 text-sm text-slate-500">If {email.trim()} has a MyVoteHub account, an admin will contact you with a temporary password. You’ll choose a new one when you sign in.</p>
          <Button className="mt-5" onClick={onClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}

export function ChangePasswordModal({ open, onClose }) {
  const [busy, setBusy] = useState(false);
  const save = async (pw) => {
    setBusy(true);
    try {
      await changePassword(pw);
      toast.success('Password changed');
      onClose();
    } catch (e) {
      toast.error('Could not change the password', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Change password" size="sm">
      <NewPasswordFields onSubmit={save} busy={busy} />
    </Modal>
  );
}
