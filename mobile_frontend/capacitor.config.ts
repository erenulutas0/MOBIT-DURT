import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mobit.docsbotops',
  appName: 'DocsBot Ops',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    path: 'android',
  },
};

export default config;
