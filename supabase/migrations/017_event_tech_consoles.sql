-- Selected mixing console IDs (JSON array) for technical rider channel limits.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS tech_console_ids TEXT NOT NULL DEFAULT '[]';
