-- One personal band per creator.
--
-- If this raises, duplicate personal bands already exist. List them and decide
-- with the owner before deleting anything. This migration does not delete rows.
--
--   SELECT created_by, COUNT(*)
--   FROM bands
--   WHERE kind = 'personal' AND created_by IS NOT NULL
--   GROUP BY created_by
--   HAVING COUNT(*) > 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM bands
    WHERE kind = 'personal' AND created_by IS NOT NULL
    GROUP BY created_by
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate personal bands exist. Report them to the owner before adding the unique index. This migration does not delete rows.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bands_one_personal_per_creator
  ON bands (created_by)
  WHERE kind = 'personal' AND created_by IS NOT NULL;
