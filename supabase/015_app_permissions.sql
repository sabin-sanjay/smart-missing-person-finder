-- =====================================================================
--  015: Let the app (logged-in users / visitors) use the new tables.
--
--  On this Supabase project, new tables are closed to the app until
--  they're granted (like 001 did for cases and sightings). The safety
--  rules (RLS) from 012 and 014 still decide WHO may see or change WHICH
--  rows; these lines only open the door so those rules can apply.
--
--  Paste into SQL Editor -> Run. Expect "Success. No rows returned".
-- =====================================================================

-- "Found someone" reports (012): finders add and see their own; police see and update all
grant select, insert, update, delete on public.found_persons to authenticated;

-- Extra case photos (014): everyone can see them; family/police add and remove
grant select                 on public.case_photos to anon;
grant select, insert, delete on public.case_photos to authenticated;

-- Police-family messages (014): only the family and police (rules decide)
grant select, insert on public.case_messages to authenticated;

-- Done! You should see "Success. No rows returned".
