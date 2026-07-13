-- Optional free-text title/role label per task assignee, shown next to the responsible/participant
-- role (e.g. "Sorumlu - AI Architect", "Görevli - Backend Developer"). Null = no custom label.
ALTER TABLE erp_task_assignments ADD COLUMN title VARCHAR(120);
