# Google Sign-In (Native plugin)

If you want reliable Google Sign-In inside the native Capacitor app (Android and iOS), use a native plugin rather than relying only on browser popups. The steps below show how to install and configure the recommended native plugin and the Google console settings required.

## Overview
- Install native plugin: `@codetrix-studio/capacitor-google-auth` (or another Capacitor Google auth plugin you prefer).
- Register OAuth clients in Google Cloud Console for Android and iOS (use package / bundle ids and SHA‑1 fingerprints).
- Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) if you use Firebase/GCP configuration and want simplified setup.

## Install the plugin
1. From the project root run:
```powershell
npm install @codetrix-studio/capacitor-google-auth --save
npx cap sync
```

## Android configuration
1. Determine your app package name (Android `applicationId`). Example in this repo: `com.nirvaana.yoga` (see `android/app/build.gradle`).
2. Get SHA-1 fingerprints you will register with Google:
   - Debug keystore (local dev):
     ```powershell
     keytool -list -v -keystore %USERPROFILE%\\.android\\debug.keystore -alias androiddebugkey -storepass android -keypass android
     ```
   - Release keystore (your production keystore):
     ```powershell
     keytool -list -v -keystore android/app/my-release-key.keystore -alias <your-alias>
     ```
3. In Google Cloud Console (or Firebase Console) create an **OAuth 2.0 Client ID** for Android:
   - Go to Credentials → Create Credentials → OAuth client ID → Android
   - Provide **Package name** = your `applicationId` (e.g. `com.nirvaana.yoga`) and the **SHA-1** fingerprint from step 2.
4. (Optional but recommended) Download the `google-services.json` for the Android app and place it at `android/app/google-services.json`.
   - `android/app/build.gradle` in this repo already applies the `com.google.gms.google-services` plugin when that file exists.
5. Run `npx cap sync android` and open Android Studio: `npx cap open android` or `npm run android`.
6. When you build and sign the release, register the release SHA-1 as well in Google Cloud Console so production sign-ins work.

## iOS configuration
1. Determine your iOS bundle identifier (the reverse-DNS app id used in Xcode). If using Capacitor defaults, it may be set in `ios/App/App/Info.plist` or `capacitor.config.ts`.
2. In Google Cloud Console (or Firebase Console) create an **OAuth 2.0 Client ID** for iOS and register the bundle id.
3. Download `GoogleService-Info.plist` (if using Firebase/GCP setup) and add it to your Xcode project (usually under `ios/App/App` in a Capacitor app). Make sure Xcode copies it into the app bundle.
4. Add the reversed client id as a URL type (this lets Google return control to your app). In Xcode this can be done by:
   - Open `Info.plist` and add a `CFBundleURLTypes` entry, e.g.:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.YOUR_REVERSED_CLIENT_ID</string>
    </array>
  </dict>
</array>
```
   - The `YOUR_REVERSED_CLIENT_ID` value comes from the `REVERSED_CLIENT_ID` key inside `GoogleService-Info.plist` (if you downloaded it). If not using Firebase, construct the reversed client id from your iOS OAuth client id by reversing the dot notation.

## Capacitor & build steps
1. After adding the native plugin and config files, run:
```powershell
npm run build
npx cap sync
npx cap open android   # or ios
```
2. For Android, ensure your debug/release keystore SHA-1 values are registered in Google console (both debug and release if you test both).
3. For iOS, ensure your `GoogleService-Info.plist` is included in the Xcode target and the URL types are present.

## Notes & testing
- Test sign-in on a physical device for both platforms — emulator/Simulator network environments occasionally block auth flows.
- For Android, if you use Google Play signing, register the Play signing SHA-1 (from Play Console) as well.
- The native plugin usually returns ID tokens and/or access tokens along with basic profile info (email, name). Send the `idToken` or `accessToken` to your backend and validate it server-side with Google before creating or logging in a user.

## References
- Capacitor Google Auth plugin (example): https://github.com/CodetrixStudio/CapacitorGoogleAuth
- Google Identity / OAuth docs: https://developers.google.com/identity
