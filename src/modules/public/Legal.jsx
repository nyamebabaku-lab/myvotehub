// Privacy policy and terms. A plain-language starting point for Ghana (Data Protection Act, 2012 (Act 843));
// have a lawyer review it before launch.
import { Link } from 'react-router-dom';
import { useDB } from '../../data/store';

const UPDATED = '18 November 2026';

function Page({ title, intro, sections }) {
  const support = useDB((s) => s.settings.supportEmail) || 'support@myvotehub.app';
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-accent-600">Last updated {UPDATED}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300">{intro}</p>
      <div className="mt-8 space-y-7">
        {sections.map(([h, body]) => (
          <section key={h}>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{h}</h2>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{typeof body === 'function' ? body(support) : body}</div>
          </section>
        ))}
      </div>
      <p className="mt-10 border-t border-slate-100 pt-6 text-sm text-slate-500 dark:border-white/5">
        Questions? Email <a href={`mailto:${support}`} className="font-bold text-brand-600">{support}</a>. See also our{' '}
        {title.startsWith('Privacy') ? <Link to="/terms" className="font-bold text-brand-600">Terms of use</Link> : <Link to="/privacy" className="font-bold text-brand-600">Privacy policy</Link>}.
      </p>
    </div>
  );
}

const ul = (items) => (
  <ul className="list-disc space-y-1 pl-5">
    {items.map((x) => <li key={x}>{x}</li>)}
  </ul>
);

export function Privacy() {
  return (
    <Page
      title="Privacy policy"
      intro="MyVoteHub runs online and USSD voting for awards, pageants, reality shows and polls in Ghana. This policy explains what personal data we collect, why, and your rights under the Data Protection Act, 2012 (Act 843)."
      sections={[
        ['Who we are', <p key="w">MyVoteHub (“we”) operates the MyVoteHub website, apps and USSD service. Event organisers use MyVoteHub to run their events; for voters’ data they are joint controllers with us for their own events.</p>],
        ['What we collect', ul([
          'Voters: phone number (or card reference), the votes you cast, payment reference and amount, and the time. We never see your MoMo PIN or full card number — payments are handled by our payment partner.',
          'Organisers, team members and judges: name, email, phone, job title, company details, verification documents (registration and Ghana Card numbers) and payout account.',
          'Nominees: the name, photo, short bio and code their organiser publishes.',
          'Technical data: device type and a random device identifier used to detect vote fraud, plus basic logs.',
        ])],
        ['Why we use it', ul([
          'To count votes, take payments, issue receipts and pay organisers.',
          'To verify organisers and keep the platform safe (fraud checks, audit logs).',
          'To send service messages, such as vote receipts, codes and account updates. We do not send marketing without your consent.',
        ])],
        ['Who we share it with', ul([
          'The organiser of the event you vote in (they see vote and payment records for their events, with phone numbers partly hidden).',
          'Our service providers: payment (e.g. Hubtel), SMS and USSD providers, and secure cloud hosting (Supabase).',
          'Authorities, when the law requires it.',
          'We never sell personal data.',
        ])],
        ['How long we keep it', <p key="k">Vote and payment records are kept for 7 years for accounting and dispute purposes. Account data is kept while your account is active and deleted or anonymised within 90 days after it is closed, unless the law requires longer.</p>],
        ['Your rights', (s) => <p>You may ask to see, correct or delete your personal data, or object to how we use it, by emailing {s}. You can also complain to the Data Protection Commission of Ghana.</p>],
        ['Security', <p key="s">Data is encrypted in transit, access is limited by role (for example, organisers can never see judges’ secret scores before release), and every important action is logged.</p>],
        ['Children', <p key="c">Voting with payments is for people 18 and over or with a parent’s permission. Organisers must have consent before publishing a child nominee’s name or photo.</p>],
      ]}
    />
  );
}

export function Terms() {
  return (
    <Page
      title="Terms of use"
      intro="These terms apply to everyone who uses MyVoteHub: voters, event organisers, their team members and judges. By using MyVoteHub you agree to them."
      sections={[
        ['Voting', ul([
          'Votes are counted in real time and shown as the organiser chooses. Results combine public votes and judges’ scores using the weighting each event displays.',
          'Paid votes are final once your payment succeeds and are not refundable, except where a payment was taken but no votes were recorded — contact us with your reference and we will fix it or refund you.',
          'Free votes are limited per phone number as each event shows. Using many numbers, scripts or bots to vote is not allowed; suspicious votes may be voided.',
        ])],
        ['Organisers', ul([
          'You must give true company details and be approved by MyVoteHub before publishing events. Every event is reviewed before it goes live.',
          'You are responsible for your event: its rules, nominees, prizes and the consent of nominees to appear.',
          'MyVoteHub keeps a commission on each paid vote (shown in your dashboard). The rest is paid to your approved payout account on request, after checks.',
          'We may pause an event, void fraudulent votes or hold payouts while we investigate complaints or suspected fraud.',
        ])],
        ['Judges and team members', <p key="j">Judges’ scores are confidential until the organiser releases results. Do not share access to your account.</p>],
        ['Accounts', <p key="a">Keep your password private. Every account is approved by MyVoteHub, which may suspend or close accounts that break these terms.</p>],
        ['Test mode', <p key="t">While the platform shows TEST MODE, payments are simulated, no money moves, and test votes may be deleted.</p>],
        ['Liability', <p key="l">We work hard to keep MyVoteHub available and accurate, but we are not liable for losses caused by network or provider outages, or by organisers’ decisions about their events. Nothing here limits rights you have under Ghanaian consumer law.</p>],
        ['Changes and law', <p key="c">We may update these terms and will show the date above. These terms are governed by the laws of Ghana.</p>],
      ]}
    />
  );
}

export default Privacy;
