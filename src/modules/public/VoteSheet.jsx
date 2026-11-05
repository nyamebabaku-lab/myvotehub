// The vote flow: choose votes → pay (MoMo/card) or verify phone (free) → confirmation.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, Smartphone, CreditCard, ShieldCheck, Share2, Minus, Plus, Lock } from 'lucide-react';
import { useDB, useSession } from '../../data/store';
import { METHODS, quote, charge, recordPayment } from '../../lib/payments';
import { castVotes, canVote, freeVotesLeft, sendOtp } from '../../lib/voting';
import { money } from '../../lib/format';
import { shareLink, publicUrl } from '../../lib/share';
import { Modal, Button, Input, Field, cx, toast } from '../../components/ui';
import { NomineePhoto } from '../../components/event';
import { LIVE } from '../../config';
import { livePay, liveRequestCode, liveCastFree } from '../../lib/liveVoting';

const validPhone = (p) => /^0\d{9}$/.test(p.replace(/\s/g, ''));
const validCard = (c) => c.replace(/\s/g, '').length >= 15;

export default function VoteSheet({ event, nominee, open, onClose }) {
  const free = event.votingMode === 'free';
  const savedVoter = useSession((s) => s.voter);
  const testMode = useDB((s) => LIVE && s.settings.testMode);
  const setVoter = useSession((s) => s.setVoter);
  const category = useDB((s) => s.categories.find((c) => c.id === nominee?.categoryId));
  const [step, setStep] = useState('qty');
  const [qty, setQty] = useState(10);
  const [method, setMethod] = useState('mtn');
  const [account, setAccount] = useState('');
  const [card, setCard] = useState({ exp: '', cvv: '' });
  const [otp, setOtp] = useState({ sent: null, code: '' });
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStep(free ? 'verify' : 'qty');
    setQty(free ? 1 : event.bundles?.[1]?.votes || 1);
    // Read the saved phone once per opening; saving it after a vote must not reset the sheet.
    const saved = useSession.getState().voter;
    setAccount(saved && !saved.includes('@') ? saved : '');
    setOtp({ sent: null, code: '' });
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a different event/sheet opens, not on live data refreshes
  }, [open, free, event?.id]);

  if (!nominee) return null;
  const allowed = canVote(event, nominee);
  const amount = quote(event, qty);
  const m = METHODS.find((x) => x.id === method);
  const voterId = method === 'card' ? `card-${account.replace(/\D/g, '').slice(-4)}` : account.replace(/\s/g, '');

  const pay = async () => {
    if (m.kind === 'momo' && !validPhone(account)) return toast.error('Enter a valid phone number', 'e.g. 0244123456');
    if (m.kind === 'card' && (!validCard(account) || !card.exp || card.cvv.length < 3)) return toast.error('Check your card details');
    setStep('processing');
    if (LIVE) {
      try {
        const res = await livePay({ nominee, qty, method, voter: voterId });
        if (m.kind === 'momo') setVoter(voterId, useSession.getState().voterCode);
        setResult(res.ok ? { ref: res.ref, qty } : { error: res.error, ref: res.ref });
        setStep(res.ok ? 'done' : 'failed');
      } catch (e) {
        setResult({ error: e.message });
        setStep('failed');
      }
      return;
    }
    const res = await charge({ method, account });
    const payment = recordPayment({ event, nominee, voter: voterId, method, amount, votes: qty, ok: res.ok });
    if (res.ok) {
      castVotes({ event, nominee, qty, voter: voterId, paymentId: payment.id });
      if (m.kind === 'momo') setVoter(voterId);
      setResult({ ref: payment.ref, qty });
      setStep('done');
    } else {
      setResult({ error: res.error, ref: payment.ref });
      setStep('failed');
    }
  };

  // Live: a verified phone keeps its code for 30 minutes so other categories don't need a new one.
  const voterCode = useSession.getState().voterCode;
  const verified = free && savedVoter && validPhone(savedVoter) && (!LIVE || !!voterCode) && (!otp.sent || otp.verified);
  const left = free ? (LIVE ? event.freeVotesPerVoter : freeVotesLeft(event, nominee.categoryId, verified ? savedVoter : account.replace(/\s/g, ''))) : 0;

  const sendCode = async () => {
    if (!validPhone(account)) return toast.error('Enter a valid phone number', 'e.g. 0244123456');
    if (LIVE) {
      try {
        const code = await liveRequestCode(account.replace(/\s/g, ''));
        setOtp({ sent: code || 'sms', code: '' });
        toast.info(code ? `Test mode code: ${code}` : 'Code sent', `To ${account}`);
      } catch (e) {
        toast.error('Could not send the code', e.message);
      }
      return;
    }
    const code = sendOtp();
    setOtp({ sent: code, code: '' });
    toast.info(`Demo SMS code: ${code}`, `Sent to ${account}`);
  };
  const castFreeLive = async (phone, code) => {
    try {
      const remaining = await liveCastFree({ phone, code, nominee });
      setVoter(phone, code);
      setOtp((o) => ({ ...o, verified: true }));
      setResult({ ref: `${remaining} left`, qty: 1, free: true });
      setStep('done');
    } catch (e) {
      if (/code/i.test(e.message)) setVoter('', '');
      toast.error('Vote not counted', e.message);
    }
  };
  const castFree = (phone) => {
    if (LIVE) return castFreeLive(phone, useSession.getState().voterCode);
    const remaining = freeVotesLeft(event, nominee.categoryId, phone);
    if (remaining < 1) return toast.error('No free votes left', event.freePeriod === 'daily' ? 'Come back tomorrow to vote again.' : 'You have used your vote in this category.');
    const v = castVotes({ event, nominee, qty: 1, voter: phone, channel: 'web' });
    setVoter(phone);
    setResult({ ref: v.id.slice(-8).toUpperCase(), qty: 1, free: true });
    setStep('done');
  };
  const verifyAndVote = () => {
    if (LIVE) return castFreeLive(account.replace(/\s/g, ''), otp.code);
    if (otp.code !== otp.sent) return toast.error('Wrong code', 'Check the SMS and try again');
    setOtp((o) => ({ ...o, verified: true }));
    castFree(account.replace(/\s/g, ''));
  };

  const header = (
    <div className="mb-5 flex items-center gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
      <NomineePhoto nominee={nominee} className="h-14 w-14" text="text-base" />
      <div className="min-w-0">
        <p className="truncate font-extrabold text-slate-900 dark:text-white">{nominee.name}</p>
        <p className="truncate text-xs text-slate-500">{category?.name} · Code <span className="font-bold text-brand-600">{nominee.code}</span></p>
      </div>
    </div>
  );

  let body;
  let footer;
  if (!allowed.ok) {
    body = <p className="py-6 text-center font-semibold text-slate-600">{allowed.reason}.</p>;
  } else if (step === 'qty') {
    body = (
      <>
        {header}
        <p className="label">Choose votes</p>
        <div className="grid grid-cols-2 gap-2.5">
          {event.bundles.map((b) => (
            <button key={b.votes} type="button" onClick={() => setQty(b.votes)} className={cx('relative rounded-2xl border-2 p-3 text-left transition', qty === b.votes ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-brand-300 dark:border-white/10')}>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">{b.votes} <span className="text-xs font-semibold text-slate-500">vote{b.votes > 1 && 's'}</span></p>
              <p className="text-sm font-bold text-brand-700 dark:text-brand-300">{money(b.price)}</p>
              {b.price < b.votes * event.pricePerVote && (
                <span className="absolute right-2 top-2 rounded-full bg-accent-600 px-1.5 py-0.5 text-[10px] font-bold text-white">-{Math.round((1 - b.price / (b.votes * event.pricePerVote)) * 100)}%</span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10">
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">Custom amount</p>
            <p className="text-xs text-slate-500">{money(event.pricePerVote)} per vote</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer"><Minus className="h-4 w-4" /></button>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))} className="input w-20 text-center font-bold" />
            <button type="button" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10" onClick={() => setQty((q) => q + 1)} aria-label="More"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </>
    );
    footer = (
      <Button variant="danger" size="lg" className="w-full" onClick={() => setStep('pay')}>
        Continue · {qty} vote{qty > 1 && 's'} for {money(amount)}
      </Button>
    );
  } else if (step === 'pay') {
    body = (
      <>
        {header}
        <p className="label">Pay with</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METHODS.map((x) => (
            <button key={x.id} type="button" onClick={() => { setMethod(x.id); setAccount(x.kind === 'card' ? '' : account.includes('@') ? '' : account); }} className={cx('flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-xs font-bold transition', method === x.id ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-white/10')}>
              <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black', x.color)}>{x.kind === 'card' ? <CreditCard className="h-4 w-4" /> : x.short.slice(0, 3)}</span>
              {x.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {m.kind === 'momo' ? (
            <Field label="Mobile money number" hint="You'll get a prompt on this phone to enter your PIN. Demo: numbers ending in 000 are declined.">
              <Input inputMode="tel" placeholder="024 412 3456" value={account} onChange={(e) => setAccount(e.target.value)} />
            </Field>
          ) : (
            <>
              <Field label="Card number" hint="Demo: any number works; one ending in 0002 is declined.">
                <Input inputMode="numeric" placeholder="4242 4242 4242 4242" value={account} onChange={(e) => setAccount(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Expiry"><Input placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} /></Field>
                <Field label="CVV"><Input inputMode="numeric" placeholder="123" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.slice(0, 4) })} /></Field>
              </div>
            </>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-sm dark:bg-white/5">
          <span className="text-slate-500">{qty} vote{qty > 1 && 's'} for {nominee.name.split(' — ')[0]}</span>
          <span className="text-lg font-extrabold text-slate-900 dark:text-white">{money(amount)}</span>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> Secured payment · Simulated in this demo</p>
      </>
    );
    footer = (
      <>
        <Button variant="secondary" onClick={() => setStep('qty')}>Back</Button>
        <Button variant="danger" size="lg" className="flex-1" icon={m.kind === 'card' ? CreditCard : Smartphone} onClick={pay}>
          Pay {money(amount)}
        </Button>
      </>
    );
  } else if (step === 'processing') {
    body = (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-brand-400/30" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white">{m.kind === 'card' ? <CreditCard className="h-8 w-8" /> : <Smartphone className="h-8 w-8" />}</div>
        </div>
        <p className="mt-6 text-lg font-extrabold text-slate-900 dark:text-white">{m.kind === 'card' ? 'Authorising your card…' : 'Check your phone'}</p>
        <p className="mt-1 max-w-xs text-sm text-slate-500">{m.kind === 'card' ? 'Contacting your bank. This takes a few seconds.' : `Approve the ${m.label} prompt for ${money(amount)} by entering your PIN.`}</p>
        <Loader2 className="mt-6 h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  } else if (step === 'verify') {
    body = (
      <>
        {header}
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          <p className="font-bold">This is a free vote</p>
          <p className="mt-0.5">{event.freeVotesPerVoter} vote per phone number per category {event.freePeriod === 'daily' ? 'each day' : 'for this event'}.</p>
        </div>
        {verified ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <ShieldCheck className="h-6 w-6 text-emerald-500" />
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-white">Verified as {savedVoter}</p>
              <p className="text-xs text-slate-500">{LIVE ? `${event.freeVotesPerVoter} free vote${event.freeVotesPerVoter > 1 ? 's' : ''} per category${event.freePeriod === 'daily' ? ' each day' : ''}` : `${left} free vote${left !== 1 ? 's' : ''} left in this category`}</p>
            </div>
            <button className="text-xs font-bold text-brand-600" onClick={() => setVoter('')}>Change</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <Field label="Your phone number" hint="We send a one-time code to make sure each person votes once.">
              <div className="flex gap-2">
                <Input inputMode="tel" placeholder="024 412 3456" value={account} onChange={(e) => setAccount(e.target.value)} disabled={!!otp.sent} />
                <Button variant="soft" onClick={otp.sent ? () => setOtp({ sent: null, code: '' }) : sendCode}>{otp.sent ? 'Edit' : 'Send code'}</Button>
              </div>
            </Field>
            {otp.sent && (
              <Field label="6-digit code" hint={otp.sent === 'sms' ? 'Check the SMS we just sent' : `${LIVE ? 'Test mode' : 'Demo'}: the code is ${otp.sent}`}>
                <Input inputMode="numeric" autoFocus maxLength={6} placeholder="••••••" className="text-center text-lg font-bold tracking-[.5em]" value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value.replace(/\D/g, '') })} />
              </Field>
            )}
          </div>
        )}
      </>
    );
    footer = verified ? (
      <Button variant="danger" size="lg" className="w-full" disabled={left < 1} onClick={() => castFree(savedVoter)}>
        {left < 1 ? 'No free votes left' : `Cast my free vote`}
      </Button>
    ) : (
      <Button variant="danger" size="lg" className="w-full" disabled={!otp.sent || otp.code.length < 6} onClick={verifyAndVote}>
        Verify & vote
      </Button>
    );
  } else if (step === 'done') {
    body = (
      <div className="flex flex-col items-center py-6 text-center">
        <div className="flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <p className="mt-5 text-2xl font-extrabold text-slate-900 dark:text-white">Vote{result.qty > 1 && 's'} counted!</p>
        <p className="mt-1 text-slate-500">
          You gave <span className="font-bold text-slate-800 dark:text-white">{result.qty} vote{result.qty > 1 && 's'}</span> to {nominee.name}.
        </p>
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-2 font-mono text-sm font-bold text-slate-700 dark:bg-white/5 dark:text-slate-200">{result.free && LIVE ? `${result.ref.split(' ')[0]} free vote${result.ref.startsWith('1 ') ? '' : 's'} left in this category` : `Ref: ${result.ref}`}</p>
        {!result.free && (
          <Link to={`/receipt/${result.ref}`} onClick={onClose} className="mt-3 text-sm font-bold text-brand-600 hover:underline">
            View receipt
          </Link>
        )}
      </div>
    );
    footer = (
      <>
        <Button variant="secondary" icon={Share2} onClick={() => shareLink(publicUrl(`/e/${event.id}/n/${nominee.id}`), `Vote for ${nominee.name}`)}>
          Share
        </Button>
        <Button className="flex-1" onClick={() => (free ? onClose() : setStep('qty'))}>{free ? 'Done' : 'Vote again'}</Button>
      </>
    );
  } else if (step === 'failed') {
    body = (
      <div className="flex flex-col items-center py-6 text-center">
        <div className="flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-accent-600 text-white"><XCircle className="h-10 w-10" /></div>
        <p className="mt-5 text-xl font-extrabold text-slate-900 dark:text-white">Payment failed</p>
        <p className="mt-1 text-slate-500">{result?.error}. You have not been charged.</p>
      </div>
    );
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button variant="danger" className="flex-1" onClick={() => setStep('pay')}>Try again</Button>
      </>
    );
  }

  return (
    <Modal open={open} onClose={step === 'processing' ? () => {} : onClose} title={free ? 'Free vote' : 'Vote'} subtitle={event.title} size="sm" footer={footer}>
      {testMode && !free && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Test mode — no real money is charged</p>}
      {body}
    </Modal>
  );
}
