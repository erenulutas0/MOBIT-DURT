ALTER TABLE erp_notification_preferences
    ADD COLUMN mobile_push_enabled BOOLEAN NOT NULL DEFAULT FALSE;
