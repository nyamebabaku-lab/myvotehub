// Which app this build is: 'main' (voters, organisers, judges), 'admin' (MyVoteHub staff) or 'demo'.
export const MODE = import.meta.env.VITE_APP || 'demo';
export const LIVE = MODE !== 'demo';
export const ADMIN_APP = MODE === 'admin';
/** Namespaces browser storage so the three apps on the same website never share data. */
export const storeKey = (name) => (MODE === 'demo' ? name : `${name}-${MODE}`);
/** Public voter website, used for share links from the Admin app. */
export const PUBLIC_SITE = 'https://nyamebabaku-lab.github.io/myvotehub/';
