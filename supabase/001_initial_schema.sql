-- =====================================================================
--  Smart Missing Person Finder — Step 2: database setup
-- =====================================================================
--  HOW TO RUN: Supabase dashboard -> SQL Editor -> New query ->
--  paste this WHOLE file -> click "Run".
--  It is safe to run again if something goes wrong halfway.
--
--  What this creates:
--    1. profiles         — one row per user (name, phone, role)
--    2. missing_persons  — the missing-person cases
--    3. sightings        — "I saw this person here" reports
--    4. Security rules (Row Level Security) on every table
--    5. Two photo storage buckets
--    6. Live updates (Realtime) for the map
--    7. A "cases near me" search function
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. PostGIS: adds map/distance features to the database
--    (e.g. "find cases within 2 km of this point")
-- ---------------------------------------------------------------------
create extension if not exists postgis with schema extensions;


-- ---------------------------------------------------------------------
-- 1. Fixed lists of allowed values ("enums")
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('public', 'family', 'police', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  -- pending -> active (approved) or rejected;  active -> found
  create type public.case_status as enum ('pending', 'active', 'rejected', 'found');
exception when duplicate_object then null; end $$;

do $$ begin
  -- police mark each sighting as confirmed or dismissed
  create type public.sighting_status as enum ('new', 'confirmed', 'dismissed');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------

-- 2a. profiles: extra info about each logged-in user.
--     Supabase keeps emails/passwords in its own hidden "auth.users" table;
--     this table is linked to it by the same id.
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text check (char_length(full_name) <= 100),
  phone              text check (char_length(phone) <= 20),
  role               public.user_role not null default 'public',
  preferred_language text not null default 'en',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 2b. missing_persons: one row per case.
--     The app sends plain latitude/longitude numbers; the database
--     builds the map point (last_seen_location) from them automatically.
create table if not exists public.missing_persons (
  id                      uuid primary key default gen_random_uuid(),
  reported_by             uuid default auth.uid() references public.profiles (id) on delete set null,

  -- About the person
  full_name               text not null check (char_length(full_name) between 1 and 100),
  age                     int  check (age between 0 and 120),
  gender                  text check (gender in ('male', 'female', 'other')),
  height_cm               int  check (height_cm between 30 and 250),
  description             text check (char_length(description) <= 2000), -- clothes, marks, etc.
  photo_path              text, -- file location inside the "case-photos" storage bucket

  -- Where and when they were last seen
  last_seen_at            timestamptz not null,
  last_seen_address       text check (char_length(last_seen_address) <= 300),
  last_seen_lat           double precision not null check (last_seen_lat between -90 and 90),
  last_seen_lng           double precision not null check (last_seen_lng between -180 and 180),
  last_seen_location      extensions.geography(Point, 4326)
                            generated always as (
                              extensions.st_setsrid(extensions.st_makepoint(last_seen_lng, last_seen_lat), 4326)::extensions.geography
                            ) stored,

  -- Case progress (filled in by police / the system, not by families)
  status                  public.case_status not null default 'pending',
  rejection_reason        text check (char_length(rejection_reason) <= 500),
  verified_by             uuid references public.profiles (id) on delete set null,
  verified_at             timestamptz,
  found_at                timestamptz,

  -- Alert circle: starts at 2 km, the backend grows it to 5 then 10
  alert_radius_km         int not null default 2 check (alert_radius_km in (2, 5, 10)),
  alert_radius_updated_at timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 2c. sightings: someone reports seeing a missing person.
create table if not exists public.sightings (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references public.missing_persons (id) on delete cascade,
  reported_by      uuid default auth.uid() references public.profiles (id) on delete set null,

  seen_at          timestamptz not null default now(),
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  location         extensions.geography(Point, 4326)
                     generated always as (
                       extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
                     ) stored,
  address          text check (char_length(address) <= 300),
  notes            text check (char_length(notes) <= 1000),
  photo_path       text, -- file location inside the "sighting-photos" bucket

  face_match_score real check (face_match_score between 0 and 1), -- set by the AI backend later
  review_status    public.sighting_status not null default 'new',
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,

  created_at       timestamptz not null default now()
);

-- Indexes = shortcuts that make searches fast (like a book's index)
create index if not exists missing_persons_location_idx on public.missing_persons using gist (last_seen_location);
create index if not exists missing_persons_status_idx   on public.missing_persons (status);
create index if not exists missing_persons_reporter_idx on public.missing_persons (reported_by);
create index if not exists sightings_location_idx       on public.sightings using gist (location);
create index if not exists sightings_case_idx           on public.sightings (case_id);
create index if not exists sightings_reporter_idx       on public.sightings (reported_by);


-- ---------------------------------------------------------------------
-- 3. HELPER FUNCTIONS used by the security rules
-- ---------------------------------------------------------------------

-- Is the logged-in user police or admin?
-- ("security definer" lets it read profiles without tripping over
--  the profiles security rules itself.)
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('police', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Is the logged-in user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- The logged-in user's role (or null if not logged in)
create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Is this change coming from a trusted place (the Supabase SQL editor
-- or our Python backend using the secret service_role key) rather than
-- from a user's phone? Trusted places may change anything.
create or replace function public.is_trusted_backend()
returns boolean
language sql stable
as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin');
$$;


-- ---------------------------------------------------------------------
-- 4. AUTOMATIC ACTIONS ("triggers")
-- ---------------------------------------------------------------------

-- 4a. When someone signs up, create their profile automatically
--     with the role "public".
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4b. Protect profiles: a normal user may switch themselves between
--     "public" and "family", but only an admin can make someone police/admin.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.id         := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();

  if new.role is distinct from old.role
     and not public.is_trusted_backend()
     and not public.is_admin()
     and not (old.role in ('public', 'family') and new.role in ('public', 'family'))
  then
    raise exception 'Only an admin can change this role';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 4c. New cases always start as "pending", owned by whoever created them.
create or replace function public.prepare_new_case()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if not public.is_trusted_backend() then
    new.reported_by             := auth.uid();
    new.status                  := 'pending';
    new.rejection_reason        := null;
    new.verified_by             := null;
    new.verified_at             := null;
    new.found_at                := null;
    new.alert_radius_km         := 2;
    new.alert_radius_updated_at := null;
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists missing_persons_prepare on public.missing_persons;
create trigger missing_persons_prepare
  before insert on public.missing_persons
  for each row execute function public.prepare_new_case();

-- 4d. Protect case updates and enforce the status flow:
--       pending -> active | rejected
--       active  -> found
--     Only police/admin can approve or reject.
--     The family who reported a case can edit it while it's pending,
--     and can mark their own active case as "found".
create or replace function public.guard_case_update()
returns trigger
language plpgsql set search_path = public
as $$
declare
  trusted   boolean := public.is_trusted_backend();
  staff     boolean := public.is_staff();
  -- columns ignored when checking "did the family change anything else?"
  skip_cols text[]  := array['status', 'found_at', 'updated_at', 'last_seen_location'];
begin
  -- These never change
  new.id          := old.id;
  new.reported_by := old.reported_by;
  new.created_at  := old.created_at;
  new.updated_at  := now();

  -- 1) The status flow applies to everyone
  if new.status is distinct from old.status
     and not (
       (old.status = 'pending' and new.status in ('active', 'rejected'))
       or (old.status = 'active' and new.status = 'found')
     )
  then
    raise exception 'A case cannot go from "%" to "%"', old.status, new.status;
  end if;

  -- 2) Users' phones may not touch system-managed fields
  if not trusted then
    new.verified_by             := old.verified_by;
    new.verified_at             := old.verified_at;
    new.found_at                := old.found_at;
    new.alert_radius_km         := old.alert_radius_km;
    new.alert_radius_updated_at := old.alert_radius_updated_at;

    if not staff then
      new.rejection_reason := old.rejection_reason;

      if old.status = 'pending' and new.status <> 'pending' then
        raise exception 'Only police or admin can approve or reject a case';
      end if;

      if old.status = 'active' and (
           new.status <> 'found'
           or (to_jsonb(new) - skip_cols) <> (to_jsonb(old) - skip_cols)
         )
      then
        raise exception 'An approved case can only be marked as found. Ask the police to change other details.';
      end if;
    end if;
  end if;

  -- 3) Fill in who/when automatically when the status changes
  if new.status is distinct from old.status then
    if new.status in ('active', 'rejected') then
      new.verified_by := auth.uid();
      new.verified_at := now();
    end if;
    if new.status = 'active' then
      new.alert_radius_km         := 2;   -- alerts start at 2 km
      new.alert_radius_updated_at := now();
    end if;
    if new.status = 'found' then
      new.found_at := now();              -- the backend stops alerts for found cases
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists missing_persons_guard on public.missing_persons;
create trigger missing_persons_guard
  before update on public.missing_persons
  for each row execute function public.guard_case_update();

-- 4e. New sightings: owned by the reporter, start as "new",
--     and nobody can fake an AI match score.
create or replace function public.prepare_new_sighting()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if not public.is_trusted_backend() then
    new.reported_by      := auth.uid();
    new.review_status    := 'new';
    new.reviewed_by      := null;
    new.reviewed_at      := null;
    new.face_match_score := null;
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists sightings_prepare on public.sightings;
create trigger sightings_prepare
  before insert on public.sightings
  for each row execute function public.prepare_new_sighting();

-- 4f. Police may only change a sighting's review status.
create or replace function public.guard_sighting_update()
returns trigger
language plpgsql set search_path = public
as $$
declare
  skip_cols text[] := array['review_status', 'reviewed_by', 'reviewed_at', 'location'];
begin
  if public.is_trusted_backend() then
    return new;
  end if;

  if (to_jsonb(new) - skip_cols) <> (to_jsonb(old) - skip_cols) then
    raise exception 'Only the review status of a sighting can be changed';
  end if;

  if new.review_status is distinct from old.review_status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists sightings_guard on public.sightings;
create trigger sightings_guard
  before update on public.sightings
  for each row execute function public.guard_sighting_update();


-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
--    Once RLS is on, NOBODY can read or change a row unless a
--    policy below allows it. "anon" = not logged in,
--    "authenticated" = logged in.
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.missing_persons enable row level security;
alter table public.sightings       enable row level security;

-- Give the app's two roles basic access; the policies then decide which rows.
grant usage on schema public to anon, authenticated;
grant select                         on public.missing_persons to anon;
grant select, insert, update, delete on public.missing_persons to authenticated;
grant select, update                 on public.profiles        to authenticated;
grant select, insert, update, delete on public.sightings       to authenticated;

-- ---- profiles ----
drop policy if exists "Users see own profile; staff see all" on public.profiles;
create policy "Users see own profile; staff see all"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists "Users edit own profile; admin edits all" on public.profiles;
create policy "Users edit own profile; admin edits all"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- (No insert policy: profiles are created automatically at sign-up.)

-- ---- missing_persons ----
drop policy if exists "Everyone sees approved and found cases" on public.missing_persons;
create policy "Everyone sees approved and found cases"
  on public.missing_persons for select to anon, authenticated
  using (status in ('active', 'found'));

drop policy if exists "Families see their own cases" on public.missing_persons;
create policy "Families see their own cases"
  on public.missing_persons for select to authenticated
  using (reported_by = auth.uid());

drop policy if exists "Staff see all cases" on public.missing_persons;
create policy "Staff see all cases"
  on public.missing_persons for select to authenticated
  using (public.is_staff());

drop policy if exists "Family, police and admin can register cases" on public.missing_persons;
create policy "Family, police and admin can register cases"
  on public.missing_persons for insert to authenticated
  with check (public.my_role() in ('family', 'police', 'admin'));

drop policy if exists "Families update own pending or active cases" on public.missing_persons;
create policy "Families update own pending or active cases"
  on public.missing_persons for update to authenticated
  using (reported_by = auth.uid() and status in ('pending', 'active'))
  with check (reported_by = auth.uid());

drop policy if exists "Staff update any case" on public.missing_persons;
create policy "Staff update any case"
  on public.missing_persons for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Families delete own pending cases; admin deletes any" on public.missing_persons;
create policy "Families delete own pending cases; admin deletes any"
  on public.missing_persons for delete to authenticated
  using ((reported_by = auth.uid() and status = 'pending') or public.is_admin());

-- ---- sightings ----
drop policy if exists "Reporters see own sightings; staff see all" on public.sightings;
create policy "Reporters see own sightings; staff see all"
  on public.sightings for select to authenticated
  using (reported_by = auth.uid() or public.is_staff());

drop policy if exists "Logged-in users report sightings of active cases" on public.sightings;
create policy "Logged-in users report sightings of active cases"
  on public.sightings for insert to authenticated
  with check (
    exists (
      select 1 from public.missing_persons m
      where m.id = case_id and m.status = 'active'
    )
  );

drop policy if exists "Staff review sightings" on public.sightings;
create policy "Staff review sightings"
  on public.sightings for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Admin deletes sightings" on public.sightings;
create policy "Admin deletes sightings"
  on public.sightings for delete to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 6. PHOTO STORAGE
--    Each user uploads into a folder named after their own user id,
--    e.g.  case-photos/<user-id>/photo.jpg
--    Max 2 MB per photo (the app will shrink photos before uploading).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Public: case photos must be visible to everyone receiving an alert.
  -- File names are long random ids, so pending photos can't be guessed.
  ('case-photos',     'case-photos',     true,  2097152, array['image/jpeg', 'image/png', 'image/webp']),
  -- Private: only the reporter and police can see sighting photos.
  ('sighting-photos', 'sighting-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Users upload case photos to own folder" on storage.objects;
create policy "Users upload case photos to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'case-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users manage own case photos" on storage.objects;
create policy "Users manage own case photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'case-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own case photos" on storage.objects;
create policy "Users delete own case photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'case-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload sighting photos to own folder" on storage.objects;
create policy "Users upload sighting photos to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sighting-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Reporter and staff view sighting photos" on storage.objects;
create policy "Reporter and staff view sighting photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sighting-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );


-- ---------------------------------------------------------------------
-- 7. REALTIME: send live updates to the map when cases/sightings change.
--    (Security rules still apply: people only receive rows they're allowed to see.)
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.missing_persons;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.sightings;
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 8. "CASES NEAR ME": active cases within radius_km of a point,
--    nearest first. The app calls it like:
--      supabase.rpc('cases_near', { user_lat: 13.08, user_lng: 80.27, radius_km: 10 })
-- ---------------------------------------------------------------------
create or replace function public.cases_near(
  user_lat  double precision,
  user_lng  double precision,
  radius_km double precision default 10
)
returns table (
  id                uuid,
  full_name         text,
  age               int,
  gender            text,
  photo_path        text,
  last_seen_at      timestamptz,
  last_seen_address text,
  last_seen_lat     double precision,
  last_seen_lng     double precision,
  distance_km       double precision
)
language sql stable
set search_path = public, extensions
as $$
  select
    m.id, m.full_name, m.age, m.gender, m.photo_path,
    m.last_seen_at, m.last_seen_address, m.last_seen_lat, m.last_seen_lng,
    st_distance(m.last_seen_location, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) / 1000
  from public.missing_persons m
  where m.status = 'active'
    and st_dwithin(
          m.last_seen_location,
          st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
          least(radius_km, 50) * 1000      -- cap at 50 km
        )
  order by 10
  limit 50;
$$;

grant execute on function public.cases_near(double precision, double precision, double precision) to anon, authenticated;

-- Done! You should see "Success. No rows returned".
