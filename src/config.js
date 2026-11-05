// Which app this build is: 'main' (voters, organisers, judges), 'admin' (MyVoteHub staff) or 'demo'.
export const MODE = import.meta.env.VITE_APP || 'demo';
export const LIVE = MODE !== 'demo';
export const ADMIN_APP = MODE === 'admin';
/** Namespaces browser storage so the three apps on the same website never share data. */
export const storeKey = (name) => (MODE === 'demo' ? name : `${name}-${MODE}`);
/** Public voter website, used for share links from the Admin app. */
export const PUBLIC_SITE = 'https://nyamebabaku-lab.github.io/myvotehub/';
/** True inside the Android app (Capacitor), false on the website. */
export const IS_NATIVE = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
const RELEASES = 'https://github.com/nyamebabaku-lab/myvotehub/releases/latest/download/';
export const APK_URL = `${RELEASES}MyVoteHub.apk`;
export const ADMIN_APK_URL = `${RELEASES}MyVoteHub-Admin.apk`;
