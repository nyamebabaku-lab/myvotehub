export const DEFAULT_SETTINGS = {
  platformName: 'MyVoteHub',
  currency: 'GH₵',
  defaultCommission: 10,
  minWithdrawal: 50,
  supportEmail: 'support@myvotehub.app',
  supportPhone: '+233 30 000 0000',
  requireEventApproval: true,
  maxVotesPerMinute: 20,
  testMode: true,
};

export const DEFAULT_BUNDLES = [
  { votes: 1, price: 1 },
  { votes: 10, price: 9 },
  { votes: 50, price: 40 },
  { votes: 100, price: 75 },
];
