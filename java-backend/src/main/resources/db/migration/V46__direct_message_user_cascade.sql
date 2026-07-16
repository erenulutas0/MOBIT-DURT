-- Deleting a user must not strand their direct messages. The sender/recipient FKs were
-- ON DELETE SET NULL, but the ck_erp_direct_messages_sender / _recipient check constraints require a
-- non-NULL id whenever the participant type is 'user'. So SET NULL produces a row that violates the
-- check, and the delete fails outright — which broke admin account deletion for anyone who had ever
-- sent or received a direct message (and made test cleanup order-dependent). Switch both FKs to
-- ON DELETE CASCADE: removing a user removes the direct messages they sent or received.
ALTER TABLE erp_direct_messages
    DROP CONSTRAINT erp_direct_messages_sender_user_id_fkey,
    ADD CONSTRAINT erp_direct_messages_sender_user_id_fkey
        FOREIGN KEY (sender_user_id) REFERENCES erp_users(id) ON DELETE CASCADE;

ALTER TABLE erp_direct_messages
    DROP CONSTRAINT erp_direct_messages_recipient_user_id_fkey,
    ADD CONSTRAINT erp_direct_messages_recipient_user_id_fkey
        FOREIGN KEY (recipient_user_id) REFERENCES erp_users(id) ON DELETE CASCADE;
