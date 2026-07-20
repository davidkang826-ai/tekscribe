# TekScribe on the App Store & Play Store

The native apps are Capacitor shells around the deployed site
(https://tekscribe.io). Every web deploy updates app users instantly — no
store re-review for day-to-day changes. Re-submit to the stores only when
something in `ios/`, `android/`, or `capacitor.config.ts` changes.

- `capacitor.config.ts` — app id (`io.tekscribe.app`), name, remote URL
- `ios/` — the Xcode project (mic/camera permission strings in
  `ios/App/App/Info.plist`)
- `android/` — the Android Studio project (permissions in
  `AndroidManifest.xml`, icon background color in
  `res/values/ic_launcher_background.xml`)
- `scripts/render-app-icons.mjs` — regenerates every icon/splash from the
  logo mark (`node scripts/render-app-icons.mjs`)

## One-time setup on your Mac

1. Clone the repo and `npm install`.
2. Install Xcode from the Mac App Store (for iOS) and Android Studio (for
   Android).
3. Apple: enroll in the Apple Developer Program ($99/yr,
   developer.apple.com — approval can take a day or two).
4. Google: create a Play Console developer account ($25 one-time,
   play.google.com/console).

## iOS: build & submit

```bash
npx cap open ios
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities** → choose your
   Apple Developer team. Xcode manages certificates automatically.
2. Pick **Any iOS Device (arm64)** as the destination.
3. **Product → Archive**, then in the Organizer window **Distribute App →
   App Store Connect → Upload**.
4. In **App Store Connect** (appstoreconnect.apple.com): create the app
   (bundle id `io.tekscribe.app`), fill in the listing (screenshots,
   description, keywords), set the **privacy policy URL** to
   https://tekscribe.io/privacy, complete the **App Privacy**
   questionnaire (data collected: email, audio recordings, photos —
   linked to identity, used for app functionality), then submit for
   review.

Review usually takes 1–3 days. Test on your own iPhone first: plug it in,
select it as the destination, and press Run.

## Android: build & submit

```bash
npx cap open android
```

In Android Studio:
1. **Build → Generate Signed App Bundle** → create a keystore when
   prompted. **Back the keystore file and passwords up somewhere safe** —
   losing it means you can never update the app again.
2. Upload the `.aab` in **Play Console** → your app → Production (or a
   testing track).
3. Fill in the listing + Data safety form, privacy policy URL
   https://tekscribe.io/privacy.

> **Heads-up:** new individual Play Console accounts must run a closed
> test with at least 12 testers for 14 days before they can publish to
> production. Start the closed test early (your Seattle pilot techs count
> as testers), or expect roughly a 3-week runway to a public Play listing.
> There is no such requirement on iOS.

## After changing anything native

```bash
npx cap sync
```

Then rebuild in Xcode / Android Studio and bump the version number before
re-uploading (iOS: MARKETING_VERSION in Xcode; Android: versionCode/
versionName in `android/app/build.gradle`).

## Universal Links (email links open the app)

Links to tekscribe.io (password reset, note links) can open the iOS app
directly instead of Safari. Three pieces, all required:

1. **Vercel env var**: set `APPLE_TEAM_ID` to your Apple Developer Team ID
   (Membership page on developer.apple.com, a 10-character code) and
   redeploy. This activates the association file the site serves at
   `/.well-known/apple-app-site-association`.
2. **Xcode**: select the App target, Signing & Capabilities, "+ Capability",
   add **Associated Domains**, then add the entry
   `applinks:tekscribe.io`.
3. Rebuild and reinstall the app. iOS fetches the association file at
   install time, so the env var must be live before you install.

`AppDelegate.swift` routes opened links to the matching in-app page.

## Known caveats

- **Google Drive connect inside the app**: Google sometimes blocks OAuth
  inside embedded web views ("disallowed_useragent"). If techs hit that,
  have them connect Drive once from Safari/Chrome (same login, sticks to
  their account) — or we add the Capacitor Browser plugin to open OAuth
  in the system browser.
- **Apple guideline 4.2 (minimum functionality)**: thin wrappers around
  websites can get pushback. TekScribe records audio, uses the camera,
  and behaves like an app, which is usually enough. If review pushes
  back, the standard fix is adding a native capability (push
  notifications is the usual one) — say the word and we'll wire it up.
