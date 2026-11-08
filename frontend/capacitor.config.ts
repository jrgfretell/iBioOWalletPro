import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mibilletepro.app',
  appName: 'Mi Billete Pro',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
