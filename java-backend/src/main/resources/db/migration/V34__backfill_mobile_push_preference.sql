-- mobile_push_enabled was never read before the MobilePushService preference
-- fix; mobile push was effectively gated by browser_push_enabled. Sync the
-- stored values once so existing users keep their current push behavior.
UPDATE erp_notification_preferences
   SET mobile_push_enabled = browser_push_enabled
 WHERE mobile_push_enabled <> browser_push_enabled;
