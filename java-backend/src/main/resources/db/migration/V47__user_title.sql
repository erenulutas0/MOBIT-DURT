-- Job title (ünvan) shown on profiles and rosters. Nullable: self-registration leaves it empty and
-- an admin assigns it later (at account approval or from the Çalışanlar screen).
ALTER TABLE erp_users ADD COLUMN title VARCHAR(120);
