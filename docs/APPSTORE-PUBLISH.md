# Publishing Uplift to the App Store

## Prerequisites

1. **Apple Developer account** ($99/year) – [developer.apple.com](https://developer.apple.com)
2. **Expo account** – Sign up at [expo.dev](https://expo.dev)
3. **EAS CLI** – Install: `npm install -g eas-cli`

## 1. Configure EAS and log in

```bash
cd /path/to/UPLIft
eas login
eas build:configure   # already done if eas.json exists
```

## 2. Update app identity (optional)

- **Bundle ID**: In `app.json`, `ios.bundleIdentifier` is set to `com.uplift.app`. Change it to your own (e.g. `com.yourcompany.uplift`) if needed. It must be unique and match what you register in App Store Connect.
- **App name**: `expo.name` is "Uplift" – change in `app.json` if you want a different display name.

## 3. Create the app in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**.
2. Choose **iOS**, name (e.g. **Uplift**), primary language, bundle ID (must match `app.json`: `com.uplift.app`), SKU (e.g. `uplift-ios`).
3. After the app is created, open it and note:
   - **App ID** (numeric, in App Information) → used as `ascAppId` in EAS submit.
   - You’ll need your **Apple ID** (email) and **Team ID** (from [developer.apple.com/account](https://developer.apple.com/account) → Membership).

## 4. Build for production (iOS)

```bash
eas build --platform ios --profile production
```

- First time: EAS will prompt for Apple credentials and can create/register the App Store Connect app and provisioning if you allow it.
- Build runs in the cloud. When it finishes, you’ll get a link to the build and (if configured) an `.ipa` download.

## 5. Submit to the App Store

**Option A – Submit from EAS (recommended)**

1. Fill in `eas.json` under `submit.production.ios`:
   - `appleId`: your Apple ID email
   - `ascAppId`: the numeric App ID from App Store Connect
   - `appleTeamId`: your Team ID from the Apple Developer account

2. Run:

```bash
eas submit --platform ios --profile production --latest
```

- `--latest` uses the most recent production build. Or use `--id <build-id>` to submit a specific build.

**Option B – Manual upload**

1. Download the `.ipa` from the EAS build page.
2. Use **Transporter** (Mac App Store) or **Xcode → Window → Organizer** to upload the `.ipa` to App Store Connect.

## 6. App Store Connect setup

In App Store Connect, for the new version:

1. **Version information**: Version (e.g. 1.0.0), “What’s New”, description, keywords, support URL, marketing URL.
2. **Screenshots**: Required for each device size (e.g. 6.7", 6.5", 5.5"). Use simulator or device.
3. **App icon**: Already in the build from `app.json`; ensure `./assets/images/icon.png` is 1024×1024.
4. **Privacy**: Privacy Policy URL; complete “App Privacy” (data collection) if needed.
5. **Pricing**: Free or paid, and availability.
6. **Submit for review**: After the build is “Processed”, attach it to the version and submit.

## 7. Future updates

- Bump `version` in `app.json` (e.g. 1.0.0 → 1.0.1) for each release.
- `buildNumber` is set to `"1"`; with `autoIncrement: true` in `eas.json`, EAS can bump the iOS build number automatically on each production build.
- Build and submit:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

Then submit the new version in App Store Connect.

## Troubleshooting

- **“No valid code signing”**: Let EAS create credentials: when prompted during the first `eas build`, choose to have EAS manage them.
- **Bundle ID mismatch**: Ensure `app.json` → `ios.bundleIdentifier` exactly matches the bundle ID in App Store Connect.
- **Build fails**: Check the build log on [expo.dev](https://expo.dev); common fixes: update `node`/`npm`, run `npx expo install --fix`, and ensure all native plugins are in `app.json` (e.g. `expo-camera`).
