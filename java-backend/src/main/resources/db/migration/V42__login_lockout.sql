-- Per-account failed-login lockout: the IP rate limit alone lets an attacker try many passwords
-- against a single account. Track consecutive failures per user and lock the account for a short
-- cooldown once a threshold is crossed.
ALTER TABLE erp_users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE erp_users ADD COLUMN locked_until TIMESTAMPTZ;
