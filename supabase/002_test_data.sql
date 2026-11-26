-- =====================================================================
--  TEST DATA: two fake cases for checking that everything works.
--  Run this AFTER 001_initial_schema.sql (SQL Editor -> New query -> Run).
--
--  - "Test Person A" is ACTIVE  -> the app's Home page SHOULD show it.
--  - "Test Person B" is PENDING -> the app SHOULD NOT show it
--    (pending cases are only for police/admin and the family).
--
--  To remove the test data later, run the last line at the bottom.
-- =====================================================================

insert into public.missing_persons
  (full_name, age, gender, description, last_seen_at, last_seen_address, last_seen_lat, last_seen_lng, status)
values
  ('Test Person A', 12, 'male',   'TEST DATA. Blue school uniform.', now() - interval '3 hours', 'Near Central Railway Station', 13.0827, 80.2707, 'active'),
  ('Test Person B', 70, 'female', 'TEST DATA. Should NOT appear in the app.', now() - interval '1 day', 'Market Road', 13.0850, 80.2750, 'pending');

-- Check the "cases near me" search: should list ONLY Test Person A,
-- about 0 km away.
select full_name, round(distance_km::numeric, 2) as km_away
from public.cases_near(13.0827, 80.2707, 10);

-- To delete the test data, remove the two dashes from the next line and run it:
-- delete from public.missing_persons where description like 'TEST DATA%';
