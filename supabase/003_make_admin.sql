-- =====================================================================
--  Give a user the "admin" or "police" role.
--  (The app never lets normal users do this themselves. Only this SQL
--   editor, or an admin, can.)
--
--  1. Sign up in the app first with the email you want to use.
--  2. Change the email below to that email.
--  3. Supabase -> SQL Editor -> New query -> paste -> Run.
--  4. In the app: log out and log in again (or refresh the page).
-- =====================================================================

update public.profiles
set role = 'admin'                  -- or 'police'
where id = (select id from auth.users where email = 'PUT-YOUR-EMAIL-HERE@example.com');

-- Check it worked: should show your email with the new role
select u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at;
