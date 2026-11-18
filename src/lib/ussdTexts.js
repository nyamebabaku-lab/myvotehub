// Editable USSD wording (defaults match ussd_default_texts() in migration 0006).
export const USSD_TEXTS = [
  { group: 'Main menu', items: [
    ['welcome', 'Welcome line', 'Welcome to MyVoteHub'],
    ['opt_code', 'Option: vote by code', 'Vote with nominee code'],
    ['opt_browse', 'Option: browse', 'Browse events'],
    ['opt_check', 'Option: check votes', 'Check votes'],
    ['opt_exit', 'Option: exit', 'Exit'],
    ['goodbye', 'Goodbye message', 'Thank you for using MyVoteHub.'],
  ] },
  { group: 'Finding a nominee', items: [
    ['enter_code', 'Ask for nominee code', 'Enter the nominee code (e.g. AOY-01):'],
    ['no_code', 'Code not found', 'No live nominee has code {code}. Check the code and try again:'],
    ['choose_event', 'Event list title', 'Choose an event:'],
    ['choose_category', 'Category list title', 'Choose a category:'],
    ['choose_nominee', 'Nominee list title', 'Choose a nominee:'],
    ['no_events', 'No events open', 'No events are open for voting right now.'],
  ] },
  { group: 'Voting', items: [
    ['vote_title', 'Vote screen title', 'Vote for {name} ({code})'],
    ['free_option', 'Free vote option', 'Cast my free vote'],
    ['other_amount', 'Other amount option', 'Other amount'],
    ['confirm', 'Confirm payment', 'Pay {amount} for {qty} votes for {name}?'],
    ['done_paid', 'After a paid vote', '{qty} votes for {name} added.'],
    ['done_free', 'After a free vote', 'Thank you! Your free vote for {name} is counted.'],
  ] },
  { group: 'Check votes', items: [
    ['check_prompt', 'Ask for code to check', 'Enter the nominee code to check votes:'],
    ['votes_count', 'Vote count answer', '{name} ({code}) has {votes} votes.'],
    ['counts_hidden', 'Counts hidden', 'Vote counts for {event} are hidden until the results are announced.'],
  ] },
  { group: 'SMS receipts', items: [
    ['sms_paid', 'SMS after a paid vote', 'MyVoteHub: {qty} votes for {name} ({code}) received. {amount}. Ref {ref}'],
    ['sms_free', 'SMS after a free vote', 'MyVoteHub: your free vote for {name} ({code}) in {event} is counted. Thank you!'],
  ] },
];
export const USSD_DEFAULTS = Object.fromEntries(USSD_TEXTS.flatMap((g) => g.items.map(([k, , d]) => [k, d])));
export const USSD_OPTIONS = { code: 'opt_code', browse: 'opt_browse', check: 'opt_check' };
export const DEFAULT_OPTIONS = [{ key: 'code', on: true }, { key: 'browse', on: true }, { key: 'check', on: true }];
export const PLACEHOLDERS = '{name} {code} {event} {qty} {amount} {votes} {ref}';

/** The main menu exactly as USSD will show it. */
export function homePreview(texts = {}, options = DEFAULT_OPTIONS) {
  const t = (k) => (texts[k]?.trim() ? texts[k] : USSD_DEFAULTS[k]);
  const on = options.filter((o) => o.on);
  return [t('welcome'), ...on.map((o, i) => `${i + 1}. ${t(USSD_OPTIONS[o.key])}`), `0. ${t('opt_exit')}`].join('\n');
}
