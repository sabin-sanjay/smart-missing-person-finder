-- =====================================================================
--  008: Let the BACKEND (Python server) read and write the tables.
--
--  Why: newer Supabase projects no longer give the backend's role
--  ("service_role", used by the SECRET key) access to new tables
--  automatically. Without this, the backend gets
--  "permission denied for table missing_persons".
--
--  This is safe: service_role is only used by the backend with the
--  secret key, which never goes in the website/app.
--
--  Paste into SQL Editor -> New query -> Run.
--  You should see "Success. No rows returned".
-- =====================================================================

grant usage on schema public to service_role;

-- Every table and counter that exists now
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- And any table we add in future scripts
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
