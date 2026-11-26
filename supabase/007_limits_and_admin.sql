-- =====================================================================
--  Step 10: spam limits + admin user list
--  Run AFTER 001-006. (SQL Editor -> New query -> paste -> Run)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. SIGHTING SPAM LIMIT
--    Each user may send at most:
--      - 1 sighting per case every 2 minutes
--      - 10 sightings in total per hour
--    Police/admin and the backend are not limited.
-- ---------------------------------------------------------------------
create or replace function public.limit_sightings()
returns trigger
language plpgsql set search_path = public  -- runs as the user, so the "trusted backend" check works
as $$
begin
  if public.is_trusted_backend() or public.is_staff() then
    return new;
  end if;

  if exists (
    select 1 from sightings
    where reported_by = auth.uid()
      and case_id = new.case_id
      and created_at > now() - interval '2 minutes'
  ) then
    raise exception 'You just reported this person. Please wait 2 minutes before sending another sighting.';
  end if;

  if (
    select count(*) from sightings
    where reported_by = auth.uid()
      and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'You have sent many sightings in the last hour. Please wait a while, or call 112 if it is urgent.';
  end if;

  return new;
end;
$$;

drop trigger if exists sightings_limit on public.sightings;
create trigger sightings_limit
  before insert on public.sightings
  for each row execute function public.limit_sightings();


-- ---------------------------------------------------------------------
-- 2. CASE SPAM LIMIT: at most 5 new cases per user per day
-- ---------------------------------------------------------------------
create or replace function public.limit_cases()
returns trigger
language plpgsql set search_path = public  -- runs as the user, so the "trusted backend" check works
as $$
begin
  if public.is_trusted_backend() or public.is_staff() then
    return new;
  end if;
  if (
    select count(*) from missing_persons
    where reported_by = auth.uid()
      and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'You can register at most 5 cases per day. Please contact your local police station.';
  end if;
  return new;
end;
$$;

drop trigger if exists missing_persons_limit on public.missing_persons;
create trigger missing_persons_limit
  before insert on public.missing_persons
  for each row execute function public.limit_cases();


-- ---------------------------------------------------------------------
-- 3. ADMIN USER LIST
--    Emails live in Supabase's hidden auth.users table, which the app
--    can't read. This function lets ONLY admins see them.
--      supabase.rpc('admin_list_users', { p_search: 'ravi' })
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default '')
returns table (
  id         uuid,
  email      text,
  full_name  text,
  phone      text,
  role       public.user_role,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list users';
  end if;

  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.created_at, u.last_sign_in_at
    from profiles p
    join auth.users u on u.id = p.id
    where p_search = ''
       or u.email ilike '%' || p_search || '%'
       or p.full_name ilike '%' || p_search || '%'
       or p.phone ilike '%' || p_search || '%'
    order by
      case p.role when 'admin' then 0 when 'police' then 1 when 'family' then 2 else 3 end,
      p.created_at desc
    limit 200;
end;
$$;

revoke all on function public.admin_list_users(text) from public, anon;
grant execute on function public.admin_list_users(text) to authenticated;

-- Done! You should see "Success. No rows returned".
