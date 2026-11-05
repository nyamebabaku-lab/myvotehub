// Two Android apps from one project: APP=main (default) → MyVoteHub, APP=admin → MyVoteHub Admin.
import type { CapacitorConfig } from '@capacitor/cli';

const admin = process.env.APP === 'admin';

const config: CapacitorConfig = {
  appId: admin ? 'com.myvotehub.admin' : 'com.myvotehub.app',
  appName: admin ? 'MyVoteHub Admin' : 'MyVoteHub',
  webDir: admin ? 'build/admin' : 'build/main',
  android: {
    path: admin ? 'android-admin' : 'android',
    backgroundColor: '#1d43d8',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 1500, launchAutoHide: true, backgroundColor: '#1d43d8', androidScaleType: 'CENTER_CROP', showSpinner: false },
    StatusBar: { backgroundColor: '#1d43d8', style: 'DARK' },
  },
};

export default config;
