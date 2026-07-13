-- Make client_message_id idempotency real: the V31 indexes were non-unique, so two
-- concurrent retries with the same client_message_id both passed the read-then-insert
-- check and produced duplicate messages. Replace with partial UNIQUE indexes.
--
-- COALESCE(user_id, -1) is used instead of NULLS NOT DISTINCT so this works on any
-- Postgres (11+) and, critically, so an admin sender (sender_user_id / author_user_id
-- IS NULL) still collides with its own retries — a plain unique index treats NULLs as
-- distinct and would let admin-sent duplicates through. Real user ids are positive
-- bigserial, so -1 never collides with a genuine id. The partial WHERE leaves rows with
-- no client_message_id (older messages, or sends that omit it) unconstrained.

DROP INDEX IF EXISTS idx_erp_direct_messages_client_id;
DROP INDEX IF EXISTS idx_document_group_messages_client_id;

CREATE UNIQUE INDEX ux_erp_direct_messages_client_id
    ON erp_direct_messages (sender_type, COALESCE(sender_user_id, -1), client_message_id)
    WHERE client_message_id IS NOT NULL;

CREATE UNIQUE INDEX ux_document_group_messages_client_id
    ON document_group_messages (group_id, COALESCE(author_user_id, -1), client_message_id)
    WHERE client_message_id IS NOT NULL;
