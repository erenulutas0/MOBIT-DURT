-- Email verification for self-service account requests. When verification is enabled a 6-digit
-- code is emailed and must be entered before an admin can approve the account. Existing rows and
-- the verification-disabled path default to verified so nothing breaks when the flag is off.
ALTER TABLE erp_account_requests ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE erp_account_requests ADD COLUMN verification_code_hash VARCHAR(255);
ALTER TABLE erp_account_requests ADD COLUMN verification_expires_at TIMESTAMPTZ;
ALTER TABLE erp_account_requests ADD COLUMN verification_attempts INTEGER NOT NULL DEFAULT 0;
