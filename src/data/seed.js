// Demo data: three organising companies, events in every state, votes, payments, judges and payouts.
// Deterministic (seeded random) so every fresh demo looks the same.

const DAY = 86400000;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import { DEFAULT_SETTINGS, DEFAULT_BUNDLES } from './constants';

export { DEFAULT_SETTINGS, DEFAULT_BUNDLES };

const NETWORKS = ['mtn', 'mtn', 'mtn', 'telecel', 'airteltigo', 'card'];
const PHONE_PREFIX = ['024', '054', '055', '059', '020', '050', '027', '057'];

export function buildSeed() {
  const r = rng(20261103);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  let n = 0;
  const id = (p) => `${p}_seed${(n++).toString(36)}`;
  const phone = () => `${pick(PHONE_PREFIX)}${int(1000000, 9999999)}`;
  const ref = (p) => `${p}${int(100000, 999999)}${String.fromCharCode(65 + int(0, 25))}`;

  // ---------------- Companies & people ----------------
  const companies = [
    { id: 'co_star', name: 'Starlight Entertainment', industry: 'Music & Entertainment', email: 'hello@starlight.events', phone: '0244100200', city: 'Accra', brandColor: '#2556eb', kyc: 'verified', status: 'active', commissionPct: 10, payout: { type: 'momo', network: 'mtn', number: '0244100200', name: 'Starlight Entertainment' }, createdAt: iso(now - 220 * DAY) },
    { id: 'co_crown', name: 'Crown & Grace Pageants', industry: 'Pageantry', email: 'info@crowngrace.org', phone: '0209300400', city: 'Kumasi', brandColor: '#be123c', kyc: 'verified', status: 'active', commissionPct: 12, payout: { type: 'bank', bank: 'GCB Bank', number: '1021304050607', name: 'Crown & Grace Ltd' }, createdAt: iso(now - 160 * DAY) },
    { id: 'co_sun', name: 'Sunrise TV Network', industry: 'Television', email: 'shows@sunrisetv.com', phone: '0557500600', city: 'Takoradi', brandColor: '#0f766e', kyc: 'verified', status: 'active', commissionPct: 8, payout: { type: 'momo', network: 'telecel', number: '0207500600', name: 'Sunrise TV Network' }, createdAt: iso(now - 120 * DAY) },
    { id: 'co_unity', name: 'Unity Campus Events', industry: 'Education', email: 'team@unitycampus.edu', phone: '0271234567', city: 'Cape Coast', brandColor: '#7c3aed', kyc: 'submitted', status: 'pending', commissionPct: 10, payout: { type: 'momo', network: 'mtn', number: '0271234567', name: 'Unity Campus Events' }, createdAt: iso(now - 2 * DAY) },
  ];

  const users = [
    { id: 'usr_admin', role: 'admin', name: 'Akosua Mensah', email: 'admin@myvotehub.app', title: 'Platform Super Admin' },
    { id: 'usr_star', role: 'organiser', companyId: 'co_star', name: 'Kwame Asante', email: 'kwame@starlight.events', title: 'Event Director' },
    { id: 'usr_star2', role: 'organiser', companyId: 'co_star', name: 'Efua Boateng', email: 'efua@starlight.events', title: 'Finance Officer' },
    { id: 'usr_crown', role: 'organiser', companyId: 'co_crown', name: 'Abena Owusu', email: 'abena@crowngrace.org', title: 'Pageant Director' },
    { id: 'usr_sun', role: 'organiser', companyId: 'co_sun', name: 'Kofi Darko', email: 'kofi@sunrisetv.com', title: 'Show Producer' },
    { id: 'usr_unity', role: 'organiser', companyId: 'co_unity', name: 'Yaw Frimpong', email: 'yaw@unitycampus.edu', title: 'SRC Events Lead' },
    { id: 'usr_j1', role: 'judge', companyId: 'co_crown', name: 'Dr. Adwoa Badu', email: 'adwoa.judge@crowngrace.org', title: 'Head Judge' },
    { id: 'usr_j2', role: 'judge', companyId: 'co_crown', name: 'Nana Yeboah', email: 'nana.judge@crowngrace.org', title: 'Fashion Designer' },
    { id: 'usr_j3', role: 'judge', companyId: 'co_crown', name: 'Esi Quaye', email: 'esi.judge@crowngrace.org', title: 'Former Queen' },
    { id: 'usr_j4', role: 'judge', companyId: 'co_star', name: 'Kojo Antwi-Boasiako', email: 'kojo.judge@starlight.events', title: 'Music Producer' },
    { id: 'usr_j5', role: 'judge', companyId: 'co_star', name: 'Ama Serwaa', email: 'ama.judge@starlight.events', title: 'Radio Presenter' },
  ].map((u) => ({ password: 'demo123', status: 'active', createdAt: iso(now - 100 * DAY), ...u }));

  // ---------------- Events ----------------
  const base = {
    votingMode: 'paid', pricePerVote: 1, bundles: DEFAULT_BUNDLES, freeVotesPerVoter: 1, freePeriod: 'event', requireOtp: true,
    publicWeight: 100, judgeWeight: 0, criteria: [], judgeIds: [], showLeaderboard: true, showCounts: true,
    rounds: null, resultsReleased: false, releasedAt: null, venue: '', timezone: 'Africa/Accra',
  };
  const events = [
    {
      ...base, id: 'evt_sma26', companyId: 'co_star', title: 'Starlight Music Awards 2026', type: 'awards', cover: 'blue',
      tagline: 'Celebrating the sound of a generation', description: 'The biggest night in urban and highlife music. Vote for your favourite artistes across six categories. Public votes count for 70% and the judging academy for 30%.',
      venue: 'Grand Arena, Accra', startAt: iso(now - 12 * DAY), endAt: iso(now + 9 * DAY), status: 'live',
      publicWeight: 70, judgeWeight: 30, judgeIds: ['usr_j4', 'usr_j5'],
      criteria: [{ id: 'c1', name: 'Artistry', max: 40 }, { id: 'c2', name: 'Impact', max: 30 }, { id: 'c3', name: 'Production', max: 30 }],
      createdAt: iso(now - 30 * DAY),
    },
    {
      ...base, id: 'evt_mgc', companyId: 'co_crown', title: 'Miss Golden Coast 2026', type: 'pageant', cover: 'red',
      tagline: 'Beauty · Brains · Purpose', description: 'Twelve finalists compete for the crown. Judges score poise, intelligence, talent and cultural wear (60%). Your votes make up the other 40%.',
      venue: 'Kumasi Cultural Centre', startAt: iso(now - 8 * DAY), endAt: iso(now + 5 * DAY), status: 'live',
      pricePerVote: 1, bundles: [{ votes: 1, price: 1 }, { votes: 5, price: 5 }, { votes: 25, price: 22 }, { votes: 100, price: 80 }],
      publicWeight: 40, judgeWeight: 60, judgeIds: ['usr_j1', 'usr_j2', 'usr_j3'],
      criteria: [{ id: 'c1', name: 'Beauty & Poise', max: 25 }, { id: 'c2', name: 'Intelligence (Q&A)', max: 30 }, { id: 'c3', name: 'Talent', max: 25 }, { id: 'c4', name: 'Cultural Wear', max: 20 }],
      createdAt: iso(now - 25 * DAY),
    },
    {
      ...base, id: 'evt_bdh', companyId: 'co_sun', title: 'Big Dream House — Season 3', type: 'reality', cover: 'night',
      tagline: 'Ten housemates. One dream. You decide.', description: 'Vote to save your favourite housemate every week. The housemate with the fewest votes at the end of each week is evicted. Votes reset every week.',
      venue: 'Sunrise TV Studios', startAt: iso(now - 20 * DAY), endAt: iso(now + 30 * DAY), status: 'live',
      pricePerVote: 0.5, bundles: [{ votes: 2, price: 1 }, { votes: 20, price: 9 }, { votes: 100, price: 40 }, { votes: 250, price: 90 }],
      rounds: { current: 3, carryOver: false, autoEvict: 1, list: [{ n: 1, label: 'Week 1', closedAt: iso(now - 13 * DAY) }, { n: 2, label: 'Week 2', closedAt: iso(now - 6 * DAY) }, { n: 3, label: 'Week 3', closedAt: null }] },
      createdAt: iso(now - 40 * DAY),
    },
    {
      ...base, id: 'evt_vc', companyId: 'co_sun', title: "Sunrise Viewers' Choice", type: 'poll', cover: 'teal',
      tagline: 'Free to vote — one vote per category per day', description: 'Tell us your favourite Sunrise TV shows and presenters. Voting is free; verify your phone number to vote once per category each day.',
      startAt: iso(now - 6 * DAY), endAt: iso(now + 14 * DAY), status: 'live', votingMode: 'free', freeVotesPerVoter: 1, freePeriod: 'daily',
      createdAt: iso(now - 9 * DAY),
    },
    {
      ...base, id: 'evt_sma25', companyId: 'co_star', title: 'Starlight Music Awards 2025', type: 'awards', cover: 'gold',
      tagline: 'Last year’s winners', description: 'Final results of the 2025 edition.', venue: 'Grand Arena, Accra',
      startAt: iso(now - 380 * DAY), endAt: iso(now - 340 * DAY), status: 'closed', resultsReleased: true, releasedAt: iso(now - 339 * DAY),
      publicWeight: 70, judgeWeight: 30, judgeIds: ['usr_j4', 'usr_j5'],
      criteria: [{ id: 'c1', name: 'Artistry', max: 40 }, { id: 'c2', name: 'Impact', max: 30 }, { id: 'c3', name: 'Production', max: 30 }],
      createdAt: iso(now - 400 * DAY),
    },
    {
      ...base, id: 'evt_gea', companyId: 'co_star', title: 'Gospel Excellence Awards', type: 'awards', cover: 'violet',
      tagline: 'Honouring ministry through music', description: 'Recognising gospel ministers, choirs and producers.', venue: 'Accra International Conference Centre',
      startAt: iso(now + 10 * DAY), endAt: iso(now + 40 * DAY), status: 'pending', submittedAt: iso(now - 1 * DAY), createdAt: iso(now - 4 * DAY),
    },
    {
      ...base, id: 'evt_mrgc', companyId: 'co_crown', title: 'Mr Golden Coast 2026', type: 'pageant', cover: 'red',
      tagline: 'Strength with purpose', description: 'Draft — finalists not yet confirmed.', startAt: iso(now + 45 * DAY), endAt: iso(now + 75 * DAY), status: 'draft',
      publicWeight: 50, judgeWeight: 50, judgeIds: ['usr_j1'], criteria: [{ id: 'c1', name: 'Physique', max: 50 }, { id: 'c2', name: 'Interview', max: 50 }],
      createdAt: iso(now - 3 * DAY),
    },
  ];

  // ---------------- Categories & nominees ----------------
  const categories = [];
  const nominees = [];
  const pop = {}; // nomineeId -> popularity weight for vote generation
  const addCat = (eventId, name, code, names, description = '') => {
    const cat = { id: id('cat'), eventId, name, code, description, order: categories.filter((c) => c.eventId === eventId).length };
    categories.push(cat);
    names.forEach((nm, i) => {
      const nom = { id: id('nom'), eventId, categoryId: cat.id, name: nm, code: `${code}-${String(i + 1).padStart(2, '0')}`, bio: '', photo: null, status: 'active' };
      nominees.push(nom);
      pop[nom.id] = 0.25 + r() * (i === 0 ? 1.4 : 1);
    });
    return cat;
  };

  const sma = {
    'Artiste of the Year': ['Kwesi Blaze', 'Adjoa Melody', 'King Paapa', 'Sena Rhythm', 'Black Nyame'],
    'Song of the Year': ['“Sika Mpo” — Adjoa Melody', '“Accra Nights” — Kwesi Blaze', '“Odo Nkoaa” — Sena Rhythm', '“Chale Wote” — Kobby Waves', '“Dumsor” — Lil Kofi'],
    'Best New Artiste': ['Lil Kofi', 'Akua Sky', 'Kobby Waves', 'Yaa Pearl'],
    'Best Highlife Song': ['“Me Dɔ Wo” — Nana Highlife', '“Abrabɔ” — King Paapa', '“Fie” — Esi Sweet', '“Akwaaba” — Daddy Lumba Jr'],
    'Best Collaboration': ['“Gold Coast” — Blaze × Melody', '“Wahala” — Paapa × Lil Kofi', '“Ayeyi” — Sena × Yaa Pearl'],
    'Producer of the Year': ['Beatz Kojo', 'MOB Sounds', 'Kaywa Jnr', 'Possigee Wave'],
  };
  const CODES = ['AOY', 'SOY', 'BNA', 'BHS', 'COL', 'POY'];
  Object.entries(sma).forEach(([name, names], i) => addCat('evt_sma26', name, CODES[i], names));

  const mgcNames = ['Afia Asantewaa', 'Akosua Nyarko', 'Dzifa Agbeko', 'Naa Adjeley', 'Esi Mensima', 'Abena Pokuaa', 'Mawuena Kpodo', 'Adwoa Kyerewaa', 'Fafa Ametewee', 'Yaa Konadu', 'Ewurabena Hagan', 'Selasi Dogbe'];
  addCat('evt_mgc', 'Contestants', 'MGC', mgcNames);

  const bdhNames = ['Jay Kwarteng', 'Princess Adomako', 'Bobby Tetteh', 'Nhyira Sarpong', 'Kweku Mensah', 'Delali Fiadzo', 'Sheila Ofori', 'Tony Baah', 'Maame Esi', 'Rocky Addo'];
  const bdhCat = addCat('evt_bdh', 'Housemates', 'BDH', bdhNames);

  addCat('evt_vc', 'Favourite Show', 'SHW', ['Morning Rise', 'Sunrise Sports Zone', 'Kitchen Queens', 'Talk of the Town', 'Teen Spot']);
  addCat('evt_vc', 'Favourite Presenter', 'PRS', ['Ama Kesewaa', 'Kojo Fynn', 'Linda Ansah', 'Fiifi Coleman']);
  addCat('evt_vc', 'Favourite Drama', 'DRM', ['House of Gold', 'Second Chances', 'Village Chief']);

  const sma25 = {
    'Artiste of the Year': ['Kwesi Blaze', 'Adjoa Melody', 'King Paapa', 'Black Nyame'],
    'Song of the Year': ['“Ɔdɔ Yɛ Dɛ” — Adjoa Melody', '“Hustle” — Black Nyame', '“Sunday” — King Paapa', '“Shine” — Sena Rhythm'],
    'Best New Artiste': ['Sena Rhythm', 'Kobby Waves', 'Esi Sweet'],
  };
  Object.entries(sma25).forEach(([name, names], i) => addCat('evt_sma25', name, CODES[i], names));

  addCat('evt_gea', 'Gospel Artiste of the Year', 'GAY', ['Minister Joe A.', 'Sister Abena Grace', 'Evang. Kofi Peace']);
  addCat('evt_gea', 'Choir of the Year', 'CHO', ['Harmony Voices', 'Joyful Way Singers', 'Calvary Mass Choir']);
  addCat('evt_mrgc', 'Contestants', 'MRG', ['Kwabena Osei', 'Edem Kumah', 'Nii Armah', 'Fiifi Essel']);

  // Big Dream House evictions: week 1 one housemate, week 2 two.
  const bdhNoms = nominees.filter((x) => x.categoryId === bdhCat.id);
  const evicted = [[bdhNoms[9], 1], [bdhNoms[7], 2], [bdhNoms[5], 2]];
  evicted.forEach(([nm, round]) => {
    nm.status = 'evicted';
    nm.evictedRound = round;
    pop[nm.id] *= 0.35;
  });

  // ---------------- Votes & payments ----------------
  const votes = [];
  const payments = [];
  const companyOf = Object.fromEntries(events.map((e) => [e.id, e.companyId]));
  const pctOf = Object.fromEntries(companies.map((c) => [c.id, c.commissionPct]));

  const weightedNominee = (list) => {
    const total = list.reduce((a, x) => a + pop[x.id], 0);
    let t = r() * total;
    for (const x of list) {
      t -= pop[x.id];
      if (t <= 0) return x;
    }
    return list[list.length - 1];
  };

  const genPaid = (ev, count, from, to, round = null, pool = null) => {
    const noms = pool || nominees.filter((x) => x.eventId === ev.id);
    for (let i = 0; i < count; i++) {
      const nom = weightedNominee(noms);
      // Recent days are busier: skew timestamps toward `to`.
      const at = from + (to - from) * Math.sqrt(r());
      const b = r() < 0.12 ? ev.bundles[ev.bundles.length - 1] : r() < 0.35 ? ev.bundles[2] : r() < 0.6 ? ev.bundles[1] : ev.bundles[0];
      const method = pick(NETWORKS);
      const voter = method === 'card' ? `${pick(['ama', 'kofi', 'yaw', 'esi', 'kojo', 'efua'])}${int(10, 99)}@mail.com` : phone();
      const cid = companyOf[ev.id];
      const commission = Math.round(b.price * pctOf[cid]) / 100;
      const failed = r() < 0.04;
      const pay = {
        id: id('pay'), ref: ref('MVH'), eventId: ev.id, companyId: cid, nomineeId: nom.id, voter, method, amount: b.price, votes: b.votes,
        commissionPct: pctOf[cid], commission: failed ? 0 : commission, net: failed ? 0 : Math.round((b.price - commission) * 100) / 100,
        status: failed ? 'failed' : 'success', at: iso(at),
      };
      payments.push(pay);
      if (!failed)
        votes.push({ id: id('vot'), eventId: ev.id, categoryId: nom.categoryId, nomineeId: nom.id, qty: b.votes, voter, channel: r() < 0.82 ? 'web' : 'ussd', paymentId: pay.id, round, at: pay.at });
    }
  };

  const ev = Object.fromEntries(events.map((e) => [e.id, e]));
  genPaid(ev.evt_sma26, 900, now - 12 * DAY, now - 30 * 60000);
  genPaid(ev.evt_mgc, 420, now - 8 * DAY, now - 20 * 60000);
  genPaid(ev.evt_sma25, 520, now - 380 * DAY, now - 341 * DAY);
  // Reality show: votes per week among housemates still in the house that week.
  const inHouse = (round) => bdhNoms.filter((x) => x.status === 'active' || x.evictedRound >= round);
  genPaid(ev.evt_bdh, 220, now - 20 * DAY, now - 13 * DAY - 3600000, 1, inHouse(1));
  genPaid(ev.evt_bdh, 240, now - 13 * DAY, now - 6 * DAY - 3600000, 2, inHouse(2));
  genPaid(ev.evt_bdh, 180, now - 6 * DAY, now - 10 * 60000, 3, inHouse(3));
  // Make sure the evicted housemates really were bottom of their week.
  evicted.forEach(([nm, round]) => {
    const roundVotes = votes.filter((v) => v.eventId === 'evt_bdh' && v.round === round);
    roundVotes.filter((v) => v.nomineeId === nm.id).forEach((v) => (v.qty = Math.max(1, Math.round(v.qty * 0.3))));
  });

  // Free poll: one vote per category per day per phone.
  const vcNoms = nominees.filter((x) => x.eventId === 'evt_vc');
  for (let i = 0; i < 700; i++) {
    const nom = weightedNominee(vcNoms);
    const at = now - 6 * DAY + 6 * DAY * Math.sqrt(r());
    votes.push({ id: id('vot'), eventId: 'evt_vc', categoryId: nom.categoryId, nomineeId: nom.id, qty: 1, voter: phone(), channel: r() < 0.7 ? 'web' : 'sms', paymentId: null, round: null, at: iso(at) });
  }
  // A couple of suspicious bursts for the fraud review screen.
  const burster = '0240000111';
  for (let i = 0; i < 6; i++) {
    const nom = vcNoms[2];
    votes.push({ id: id('vot'), eventId: 'evt_vc', categoryId: nom.categoryId, nomineeId: nom.id, qty: 1, voter: burster, channel: 'web', paymentId: null, round: null, at: iso(now - 3 * 3600000 + i * 4000), flagged: 'Burst: 6 votes in 20s from one device' });
  }

  // ---------------- Judges' scores ----------------
  const scores = [];
  const scoreFor = (event, judgeId, nom, submitted, bias = 0) => {
    const s = {};
    event.criteria.forEach((c) => (s[c.id] = Math.max(1, Math.min(c.max, Math.round(c.max * (0.55 + r() * 0.35 + bias))))));
    const total = Object.values(s).reduce((a, x) => a + x, 0);
    scores.push({ id: id('scr'), eventId: event.id, judgeId, nomineeId: nom.id, categoryId: nom.categoryId, scores: s, total, comment: '', submitted, at: iso(now - int(1, 5) * DAY) });
  };
  nominees.filter((x) => x.eventId === 'evt_mgc').forEach((nom, i) => {
    const bias = i === 1 || i === 4 ? 0.08 : 0;
    scoreFor(ev.evt_mgc, 'usr_j1', nom, true, bias);
    scoreFor(ev.evt_mgc, 'usr_j2', nom, true, bias);
    if (i < 7) scoreFor(ev.evt_mgc, 'usr_j3', nom, false, bias); // still scoring (draft)
  });
  nominees.filter((x) => x.eventId === 'evt_sma26').forEach((nom) => {
    scoreFor(ev.evt_sma26, 'usr_j4', nom, true);
    if (r() < 0.6) scoreFor(ev.evt_sma26, 'usr_j5', nom, r() < 0.5);
  });
  nominees.filter((x) => x.eventId === 'evt_sma25').forEach((nom) => {
    scoreFor(ev.evt_sma25, 'usr_j4', nom, true);
    scoreFor(ev.evt_sma25, 'usr_j5', nom, true);
  });

  // ---------------- Evictions ----------------
  const evictions = evicted.map(([nm, round]) => ({
    id: id('evc'), eventId: 'evt_bdh', categoryId: nm.categoryId, nomineeId: nm.id, round, mode: 'auto', reason: `Lowest votes in Week ${round}`, by: 'usr_sun', at: ev.evt_bdh.rounds.list[round - 1].closedAt,
  }));

  // ---------------- Withdrawals ----------------
  const wd = (companyId, amount, status, daysAgo, by, extra = {}) => ({
    id: id('wd'), ref: ref('WD'), companyId, amount, fee: 0, destination: companies.find((c) => c.id === companyId).payout, status, requestedBy: by,
    requestedAt: iso(now - daysAgo * DAY), decidedAt: status === 'pending' ? null : iso(now - (daysAgo - 1) * DAY), decidedBy: status === 'pending' ? null : 'usr_admin', note: '', ...extra,
  });
  const withdrawals = [
    wd('co_star', 6000, 'paid', 330, 'usr_star2', { payoutRef: 'TRX88123401' }),
    wd('co_star', 4500, 'paid', 7, 'usr_star2', { payoutRef: 'TRX88239917' }),
    wd('co_star', 2500, 'pending', 0.2, 'usr_star2'),
    wd('co_crown', 1500, 'paid', 4, 'usr_crown', { payoutRef: 'TRX88240112' }),
    wd('co_crown', 9000, 'rejected', 2, 'usr_crown', { note: 'Amount exceeds available balance at time of request.' }),
    wd('co_sun', 1200, 'pending', 0.5, 'usr_sun'),
  ];

  // ---------------- Audit & notifications ----------------
  const audit = [
    { action: 'Withdrawal requested', detail: 'GH₵ 1,200.00 to Telecel Cash', userId: 'usr_sun', companyId: 'co_sun', h: 12 },
    { action: 'Withdrawal requested', detail: 'GH₵ 2,500.00 to MTN MoMo', userId: 'usr_star2', companyId: 'co_star', h: 5 },
    { action: 'Event submitted', detail: 'Gospel Excellence Awards sent for approval', userId: 'usr_star', companyId: 'co_star', eventId: 'evt_gea', h: 24 },
    { action: 'Company onboarded', detail: 'Unity Campus Events applied (KYC submitted)', userId: 'usr_unity', companyId: 'co_unity', h: 48 },
    { action: 'Votes flagged', detail: "6 votes in 20s on Sunrise Viewers' Choice", userId: null, eventId: 'evt_vc', h: 3 },
    { action: 'Round closed', detail: 'Big Dream House Week 2 — 2 housemates evicted', userId: 'usr_sun', companyId: 'co_sun', eventId: 'evt_bdh', h: 144 },
    { action: 'Withdrawal paid', detail: 'GH₵ 1,500.00 to GCB Bank', userId: 'usr_admin', companyId: 'co_crown', h: 72 },
  ]
    .sort((a, b) => a.h - b.h)
    .map(({ h, ...a }) => ({ id: id('aud'), at: iso(now - h * 3600000), ...a }));

  const notifications = [
    { toRole: 'admin', title: '2 withdrawals awaiting approval', text: 'Starlight Entertainment and Sunrise TV Network', link: '/app/withdrawals', h: 5 },
    { toRole: 'admin', title: 'New event to review', text: 'Gospel Excellence Awards', link: '/app/approvals', h: 24 },
    { toRole: 'admin', title: 'New company application', text: 'Unity Campus Events', link: '/app/companies', h: 48 },
    { companyId: 'co_crown', title: 'Withdrawal paid', text: 'GH₵ 1,500.00 sent to GCB Bank', link: '/app/wallet', h: 72 },
    { userId: 'usr_j3', title: 'You have unscored contestants', text: 'Miss Golden Coast 2026 — 5 remaining', link: '/app/judging', h: 10 },
  ].map(({ h, ...x }) => ({ id: id('ntf'), at: iso(now - h * 3600000), read: false, ...x }));

  return { settings: { ...DEFAULT_SETTINGS }, companies, users, events, categories, nominees, votes, payments, scores, evictions, withdrawals, audit, notifications };
}
