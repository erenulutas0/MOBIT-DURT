-- Self-service registration: users may now choose a username and log in with it. Email/phone become
-- optional contact fields. The column is NULLABLE so existing accounts (which log in by email) are
-- untouched; the unique index is on lower(username) and, because unique indexes treat NULLs as
-- distinct, any number of legacy rows with a NULL username coexist without conflict.
ALTER TABLE erp_users ADD COLUMN username VARCHAR(64);
CREATE UNIQUE INDEX ux_erp_users_username_lower ON erp_users (lower(username));
