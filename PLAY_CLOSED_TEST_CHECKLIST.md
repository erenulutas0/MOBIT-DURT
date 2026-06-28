# Google Play Closed Test Checklist

DocsBot Ops mobile is prepared as a Capacitor Android app under `mobile_frontend`.

## Current Android Build

- App ID: `com.mobit.docsbotops`
- App name: `DocsBot Ops`
- Web bundle source: `mobile_frontend/dist`
- Android project: `mobile_frontend/android`
- Debug APK command: `npm run android:debug`
- Release bundle command: `npm run android:bundle`
- Release AAB output: `mobile_frontend/android/app/build/outputs/bundle/release/app-release.aab`

## Before Uploading to Play Console

1. Choose the Play Console account type.
2. Create the app in Play Console with package name `com.mobit.docsbotops`.
3. Enable Play App Signing.
4. Create an upload keystore and keep it outside git.
5. Copy `mobile_frontend/android/keystore.properties.example` to `mobile_frontend/android/keystore.properties`.
6. Fill `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`.
7. Run `npm run android:bundle`.
8. Upload the generated AAB to Internal testing first.
9. Verify install, login, navigation, push-permission behavior, and backend connectivity.
10. Promote the same track/build to Closed testing when the listing and tester list are ready.

## Closed Test Requirements

Google's current official guidance says new personal developer accounts must run a
closed test with at least 12 opted-in testers for 14 consecutive days before applying
for production access.

Source: https://support.google.com/googleplay/android-developer/answer/14151465

Use a Google Group or an email list for testers. Tell testers not to opt out during
the 14-day window. Recruit more than the minimum, for example 15-20 people, so one
person dropping out does not reset the plan.

## Tester Instructions

Send testers:

- The Play testing opt-in link
- The expected test dates
- A short login/account-flow guide
- A feedback channel
- A reminder to stay opted in continuously for the full test window

Suggested daily smoke test:

1. Open DocsBot Ops.
2. Log in or submit an account request.
3. Open ERP tasks.
4. Open notifications.
5. Open profile.
6. Report any crash, blank page, login failure, or text/layout issue.

## Store Assets To Prepare

- App icon: 512x512 PNG
- Feature graphic: 1024x500 PNG
- Phone screenshots
- Short description
- Full description
- Privacy policy URL
- Support/contact email
- Data safety form answers
- App access instructions for reviewers

## Release Notes Draft

DocsBot Ops closed test build:

- Mobile-first ERP dashboard
- Task, Tender Hub, Messages, and Profile tabs
- Role-aware admin/user navigation
- Dark Mobit visual theme
- Backend integration pending for selected Figma prototype screens
