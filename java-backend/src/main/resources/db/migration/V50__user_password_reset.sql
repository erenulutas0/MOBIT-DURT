-- Password recovery. Until now there was no way back into an account whose password was forgotten:
-- no self-service reset, no admin reset, not even a "change my password" for a signed-in user — a
-- forgotten password meant a permanently locked-out employee.
--
-- An admin-set password is known to someone other than its owner, so it is a TEMPORARY credential:
-- this flag marks the account until the owner replaces it with one only they know.
ALTER TABLE erp_users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
