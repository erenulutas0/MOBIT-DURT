# Mobile Push Notification Plan

DocsBot Ops mobile app will use native push notifications for ERP task assignments, completion approvals/rejections, deadline alerts, manager messages, and critical Tender Hub ingestion events.

## Chosen Direction

- Use Capacitor's official Push Notifications plugin.
- Android delivery: Firebase Cloud Messaging with `google-services.json` in `mobile_frontend/android/app`.
- iOS delivery: APNs via the same Capacitor plugin when an iOS wrapper is added later.
- Keep the existing Java notification domain as the source of truth.
- Add mobile device-token registration separately from the existing browser Web Push subscription model.

References:

- Capacitor Push Notifications: https://capacitorjs.com/docs/apis/push-notifications
- Firebase Cloud Messaging Android setup: https://firebase.google.com/docs/cloud-messaging/android/get-started
- Firebase Cloud Messaging overview: https://firebase.google.com/docs/cloud-messaging

## Backend Work

- Add `erp_mobile_push_tokens` table with `user_id`, `platform`, `device_id`, `token`, `enabled`, `last_seen_at`, and audit timestamps.
- Add authenticated endpoints:
  - `POST /erp/mobile-push/tokens`
  - `DELETE /erp/mobile-push/tokens/{device_id}`
  - `POST /erp/mobile-push/test`
- Extend `NotificationDelivery` with `channel = mobile_push`.
- Add a `MobilePushDeliveryService` that fans out only unread/eligible ERP notifications.
- Android delivery uses FCM HTTP v1. Production should prefer `DOCSBOT_FCM_SERVICE_ACCOUNT_PATH`
  or `DOCSBOT_FCM_SERVICE_ACCOUNT_JSON`; `DOCSBOT_FCM_ACCESS_TOKEN` remains a short-lived
  operational fallback.
- iOS delivery uses APNs provider tokens (`DOCSBOT_APNS_TEAM_ID`, `DOCSBOT_APNS_KEY_ID`,
  `DOCSBOT_APNS_BUNDLE_ID`, and `DOCSBOT_APNS_PRIVATE_KEY_PATH` or `DOCSBOT_APNS_PRIVATE_KEY`).
  Use `DOCSBOT_APNS_ENVIRONMENT=production` for TestFlight/App Store builds.
- Respect existing `ERPNotificationPreference` fields before sending.
- Store failed delivery reason and disable stale tokens after repeated permanent failures.

## Mobile Work

- Install `@capacitor/push-notifications`.
- Add Android Firebase config file outside git history.
- Request notification permission after login, not on the first launch screen.
- Register the native token with Java backend using a stable generated device id.
- Remove token on logout.
- Route notification taps to the right tab:
  - task notification -> ERP task detail
  - tender document notification -> Tender document detail
  - generic notification -> ERP notifications

## Release Notes

- Closed testing can launch without native push if in-app notifications are working.
- Before public production, mobile push should be implemented and tested on at least one real Android device.
- iOS device validation is a separate release track because it requires Apple Developer account, Xcode capabilities, and device testing.
