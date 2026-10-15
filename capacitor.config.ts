import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.abdimuratov.taverntd',
  appName: 'Tavern TD',
  webDir: 'dist-android',
  backgroundColor: '#12100e',
  android: {
    // Saves must never be wiped by a WebView origin change between builds.
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: { overlaysWebView: true },
  },
};

export default config;
