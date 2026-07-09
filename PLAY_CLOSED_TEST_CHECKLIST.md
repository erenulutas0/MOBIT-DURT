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

## Current Closed-Test Build: Mobit 1.0.6

- App ID: `com.mobit.docsbotops`
- Track: Google Play closed test
- Backend: `https://84-46-251-95.sslip.io`
- Admin test login: `admin@mobit.com.tr` / password in the team vault (`MOBIT_SMOKE_ADMIN_PASSWORD`)
- Employee test login: `user@mobit.com.tr` / password in the team vault (`MOBIT_SMOKE_USER_PASSWORD`)
- Credentials must never be written into this repository; see `TODO.md` security rules.
- Privacy policy: `https://erenulutas0.github.io/DocsBot/privacy-policy.html`
- Account deletion: `https://erenulutas0.github.io/DocsBot/account-deletion.html`

### Demo-Day Smoke Test

Run this before showing the app to a stakeholder or adding a new closed-test build.

Automated backend smoke command:

```powershell
cd mobile_frontend
npm run smoke:prod
```

The command verifies production health, admin login, employee login, ERP overview,
account requests, document groups, notifications, and direct messages.

1. Open the Play-installed app.
2. Log in as admin.
3. Confirm bottom navigation shows `Ana Sayfa`, `ERP`, `Dokümanlar`, `Mesajlar`, `Profil`.
4. Open `ERP` and confirm the screen does not show a connection error.
5. Open `Mesajlar`, create or open a room, and send a short text message.
6. Attach one image and confirm it renders inline in the chat.
7. Attach one PDF and confirm `Görüntüle` and `İndir` actions are visible.
8. Open the room `Dokümanlar` tab and confirm the uploaded file appears in the room document list.
9. Open `Dokümanlar` and confirm the document network/dashboard loads without `failed to fetch`.
10. Log out.
11. Log in as employee.
12. Confirm employee sees only the allowed navigation and does not see admin-only document network controls unless permission is granted.
13. Send a direct message to admin.
14. Log back in as admin and confirm the direct message appears.
15. Create a task for the employee and confirm it appears in the employee task list.
16. From the employee account, request task completion.
17. From admin, approve or reject the completion request.
18. Open `Profil`, verify role, notification toggles, and logout.

### New Account Request Smoke Test

1. On the login screen, open `Hesap Talebi`.
2. Submit a request with a unique email and a password of at least 10 characters.
3. Confirm the app shows the Turkish success message.
4. Log in as admin.
5. Open `ERP > Hesap Talepleri`.
6. Confirm the new request appears with name, email, optional phone, and request date.
7. Approve the request.
8. Log out and log in with the newly approved employee account.

### Regression Watchlist

- Admin login must map `admin@mobit.com.tr` (password from the team vault) to the production admin session.
- Employee login must use `user@mobit.com.tr` (password from the team vault).
- No demo account cards should be visible on the login screen.
- All newly visible labels should be Turkish.
- Message forwarding should preserve image/document preview and download behavior.
- PDF preview failures should still leave a working `İndir` action.
- The app should not overlap with Android status/navigation bars.
- Backend errors should be shown as clear Turkish messages, not raw `Unauthorized` or `failed to fetch` where avoidable.

### Feedback Template for Testers

Ask testers to send feedback in this shape:

```text
Telefon modeli:
Android sürümü:
Uygulama sürümü:
Hesap türü: Admin / Çalışan
Ne yapmaya çalıştım:
Ne oldu:
Beklediğim:
Ekran görüntüsü/video:
```
