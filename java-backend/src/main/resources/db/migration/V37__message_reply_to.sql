ALTER TABLE erp_direct_messages
    ADD COLUMN reply_to_message_id BIGINT REFERENCES erp_direct_messages(id) ON DELETE SET NULL;

ALTER TABLE document_group_messages
    ADD COLUMN reply_to_message_id BIGINT REFERENCES document_group_messages(id) ON DELETE SET NULL;
