-- Enable row level security on every public table and remove the Data API grants.
--
-- Do not apply this until the owner confirms two things:
-- 1. GET <SUPABASE_URL>/rest/v1/profiles?select=* with the anon key currently returns rows.
-- 2. DATABASE_URL uses a role that bypasses RLS (the Supabase postgres owner). This
--    migration adds no policies, so anon and authenticated are denied. The Express
--    server must still be able to read and write.
--
-- This file does not delete data. It does not grant anything back to anon or authenticated.

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
  END LOOP;
END $$;
