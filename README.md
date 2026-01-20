# Nirvaana Yoga - Web + Android (Capacitor)

The React + TypeScript experience now ships inside a Capacitor-powered Android shell. Follow the steps below to develop, run, and distribute the mobile app.

## 1. Prerequisites
- Node.js 18+ with npm
- Java 17 (matches the Android Gradle Plugin toolchain)
- Android Studio (SDKs, emulator images, `sdkmanager`, `avdmanager`)
- Capacitor CLI (already included locally via dev dependencies)

> After cloning, run `npm install` once to restore all web and native dependencies (Capacitor, fonts, etc.).

## 2. Web Development Workflow
| Task | Command |
| --- | --- |
| Start local dev server | `npm start` |
| Run tests | `npm test` |
| Production build (feeds Capacitor) | `npm run build` |
| Copy web assets into native shells | `npm run cap:copy` |
| Copy + update native plugins/platforms | `npm run cap:sync` |
| Open the Android project in Android Studio | `npm run android` |

The build output in `build/` is fully offline-ready other than intentional API calls. Fonts are bundled locally with `@fontsource`, so the runtime makes no CDN requests.

## 3. Android Workflow
1. **Prepare the web bundle**
   ```bash
   npm run build
   npm run cap:sync
   ```
2. **Open Android Studio**
   - `npm run android` (opens Android Studio) or `npx cap open android` manually.
3. **Run on an emulator**
   - Create and boot an emulator from Android Studio's Device Manager (Pixel 5, API 34, etc.).
   - Press the green Run triangle in Android Studio or execute `npx cap run android -l --target <emulator-id>` for live reload.
4. **Run on a physical device**
   - Enable Developer Mode + USB debugging on the phone.
   - Connect via USB (or Wi-Fi ADB) and authorize the PC.
   - Select the device in Android Studio and press Run, or run `npx cap run android --target <device-id>`.
   - For sideloading, build the debug APK with `cd android && ./gradlew assembleDebug` then install via `adb install app-debug.apk`.

Capacitor enforces immersive fullscreen (see `android/app/src/main/java/com/nirvaana/yoga/MainActivity.java`) and the StatusBar plugin hides system chrome once React mounts.

## 4. Generating Signed Builds
### Create or reuse a keystore
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore nirvaana.keystore ^
  -alias nirvaana ^
  -keyalg RSA -keysize 2048 -validity 10000
```
Store the keystore, alias, and passwords securely.

### Build a signed APK
1. `npm run build && npm run cap:sync`
2. From `android/`, run:
   ```bash
   ./gradlew assembleRelease
   ```
3. Sign and align (if you skip Android Studio's "Generate Signed Bundle / APK" wizard):
   ```bash
   jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 ^
     -keystore ../nirvaana.keystore app-release-unsigned.apk nirvaana
   "${ANDROID_SDK_ROOT}/build-tools/<version>/zipalign" -f 4 app-release-unsigned.apk NirvaanaYoga-release.apk
   ```
4. Distribute `android/app/build/outputs/apk/release/app-release.apk`.

### Build a signed AAB (Play Store)
1. `npm run build && npm run cap:sync`
2. `./gradlew bundleRelease`
3. Sign via Android Studio (recommended) or `jarsigner` as above. The bundle is in `android/app/build/outputs/bundle/release/app-release.aab`.

## 5. Splash Screen and App Icons
- Capacitor's splash plugin is configured in `capacitor.config.ts`. Replace `android/app/src/main/res/drawable*/splash.png` with your 2732x2732 asset (logo centered on solid background) before syncing.
- App icons live in `android/app/src/main/res/mipmap-*`. Replace them manually or run:
  ```bash
  npx @capacitor/assets generate --icon path/to/icon.png --splash path/to/splash.png
  npm run cap:sync
  ```
  (Install `@capacitor/assets` globally or invoke via `npx` when needed.)

## 6. OTP Endpoint
All send-OTP flows use `https://apiservices.nirvaanayoga.com:8443/api/v1/otp/send-otp`. Update `src/constants.ts` if the backend changes so every feature picks up the same URL automatically.

## 7. Mobile Optimizations and Offline Notes
- Local fonts and manifest updates remove external font/CDN requests. The packaged app works offline except when it intentionally calls OTP APIs.
- Safe-area padding plus fullscreen themes prevent letterboxing on devices with cutouts.
- Status bar and navigation chrome are hidden so the app feels native, and Capacitor's immersive flags keep it fullscreen.
- For smaller binaries set `GENERATE_SOURCEMAP=false npm run build` when producing release builds (optional).

## 8. Troubleshooting
- `npx cap sync android --inline` to inspect sync logs.
- `cd android && ./gradlew clean` if Gradle caching causes odd build failures.
- Check Logcat for `Failed to send OTP` to debug connectivity to the HTTPS endpoint.
- Ensure Android trusts your backend certificate (uses port 8443). If targeting a non-HTTPS environment temporarily, add a network security config or enable `android:usesCleartextTraffic="true"` (then revert before release).
