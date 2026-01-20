import type { CapacitorConfig } from '@capacitor/cli';

const GOOGLE_CLIENT_ID = "84582538205-03gdcucanamjov80espi88bgkcfkmgel.apps.googleusercontent.com";

const config: CapacitorConfig = {
  appId: 'com.nirvaana.yoga',
  appName: 'NirvaanaYoga',
  webDir: 'build',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  android: {
    backgroundColor: '#000000',
    allowMixedContent: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
     GoogleAuth: {
    scopes: ['profile', 'email'],
    serverClientId: GOOGLE_CLIENT_ID,
    forceCodeForRefreshToken: true,
  },
  }
};

export default config;
