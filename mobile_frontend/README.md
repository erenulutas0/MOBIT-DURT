
# DocsBot Ops Mobile

Mobile-first DocsBot Ops client generated from the Figma prototype and prepared for
Android packaging with Capacitor.

## Development

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

For Android emulator development against the local Java backend, set:

```text
VITE_API_BASE_URL=http://10.0.2.2:8080
```

For Play testing and production builds, use an HTTPS backend URL.

## Web Build

```powershell
npm run typecheck
npm run build
```

## Android Build

```powershell
npm run android:sync
npm run android:debug
npm run android:bundle
```

The release bundle is written to:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

For Google Play closed testing, follow `../PLAY_CLOSED_TEST_CHECKLIST.md`.
