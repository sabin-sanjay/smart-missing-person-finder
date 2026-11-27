-- =====================================================================
--  012: Family sighting updates + "Found someone unknown" registry
--
--  1. FAMILY UPDATES: when someone reports a sighting, the family that
--     registered the case gets a push: "Someone reported seeing <name>".
--     sightings.family_notified_at remembers it was sent (only once).
--
--  2. FOUND PERSONS: anyone can register an unknown person they found
--     (lost child, confused elderly person...). The backend's AI compares
--     the photo with every active missing case and saves the best match.
--     Police see all reports; the finder sees their own.
--
--  Paste into SQL Editor -> Run. Expect "Success. No rows returned".
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. FAMILY UPDATES
-- ---------------------------------------------------------------------
alter table public.sightings add column if not exists family_notified_at timestamptz;

-- Sightings that already exist: don't send old news
update public.sightings set family_notified_at = now() where family_notified_at is null;

-- Phones can't fake "already told" (only the backend may set it)
create or replace function public.guard_sighting_family_notified()
returns trigger
language plpgsql set search_path = public   -- NOT security definer on purpose
as $$
begin
  if not public.is_trusted_backend() then
    if tg_op = 'INSERT' then
      new.family_notified_at := null;
    else
      new.family_notified_at := old.family_notified_at;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists sightings_guard_family_notified on public.sightings;
create trigger sightings_guard_family_notified
  before insert or update on public.sightings
  for each row execute function public.guard_sighting_family_notified();

-- New sightings (last 24 h) whose family hasn't been told yet, with the
-- family's phones. A sighting the family reported themselves is skipped.
-- A sighting with no family phone still comes back once (fcm_token null),
-- so the backend can mark it done.
create or replace function public.pending_sighting_notices(p_limit int default 200)
returns table (sighting_id uuid, case_id uuid, full_name text, fcm_token text)
language sql stable security definer set search_path = public
as $$
  select s.id, m.id, m.full_name, a.fcm_token
  from sightings s
  join missing_persons m on m.id = s.case_id
  left join alert_subscriptions a
         on a.user_id = m.reported_by
        and a.fcm_token is not null
        and (s.reported_by is null or s.reported_by is distinct from m.reported_by)
  where s.family_notified_at is null
    and s.created_at > now() - interval '1 day'
    and s.review_status <> 'dismissed'
    and m.status = 'active'
  limit p_limit;
$$;

create or replace function public.mark_sighting_notified(p_ids uuid[])
returns void
language sql security definer set search_path = public
as $$
  update sightings set family_notified_at = now() where id = any(p_ids);
$$;

revoke all on function public.pending_sighting_notices(int) from public, anon, authenticated;
revoke all on function public.mark_sighting_notified(uuid[]) from public, anon, authenticated;
grant execute on function public.pending_sighting_notices(int) to service_role;
grant execute on function public.mark_sighting_notified(uuid[]) to service_role;


-- ---------------------------------------------------------------------
-- 2. FOUND PERSONS
-- ---------------------------------------------------------------------
create table if not exists public.found_persons (
  id               uuid primary key default gen_random_uuid(),
  reported_by      uuid references public.profiles (id) on delete set null,
  photo_path       text not null,              -- inside the private "found-photos" bucket
  found_at         timestamptz not null default now(),
  lat              double precision,
  lng              double precision,
  address          text,
  description      text check (char_length(description) <= 1000),
  status           text not null default 'open' check (status in ('open', 'matched', 'closed')),
  match_case_id    uuid references public.missing_persons (id) on delete set null,
  match_score      real,                       -- 0..1, filled in by the backend
  face_checked_at  timestamptz,
  face_error       text,
  notified_at      timestamptz,                -- police told about a likely match
  created_at       timestamptz not null default now()
);
create index if not exists found_persons_created_idx on public.found_persons (created_at desc);

-- The face "fingerprint" of each found person (backend only)
create table if not exists public.found_faces (
  found_id    uuid primary key references public.found_persons (id) on delete cascade,
  embedding   extensions.vector(512),
  computed_at timestamptz not null default now()
);
alter table public.found_faces enable row level security;
revoke all on public.found_faces from anon, authenticated;

alter table public.found_persons enable row level security;

drop policy if exists "Finder sees own reports; staff see all" on public.found_persons;
create policy "Finder sees own reports; staff see all"
  on public.found_persons for select to authenticated
  using (reported_by = auth.uid() or public.is_staff());

drop policy if exists "Logged-in users register found persons" on public.found_persons;
create policy "Logged-in users register found persons"
  on public.found_persons for insert to authenticated
  with check (reported_by = auth.uid());

drop policy if exists "Staff update found persons" on public.found_persons;
create policy "Staff update found persons"
  on public.found_persons for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff delete found persons" on public.found_persons;
create policy "Staff delete found persons"
  on public.found_persons for delete to authenticated
  using (public.is_staff());

-- New report: fill in the safe values; at most 10 reports a day per person.
-- Updates by police: they may only change the status (the AI fields are the backend's).
-- NOT security definer: it must see who is really making the change.
create or replace function public.prepare_found_person()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_trusted_backend() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from found_persons
        where reported_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
      raise exception 'You can register at most 10 found persons a day.';
    end if;
    new.reported_by     := auth.uid();
    new.status          := 'open';
    new.match_case_id   := null;
    new.match_score     := null;
    new.face_checked_at := null;
    new.face_error      := null;
    new.notified_at     := null;
    new.created_at      := now();
  else
    new.reported_by     := old.reported_by;
    new.photo_path      := old.photo_path;
    new.match_case_id   := old.match_case_id;
    new.match_score     := old.match_score;
    new.face_checked_at := old.face_checked_at;
    new.face_error      := old.face_error;
    new.notified_at     := old.notified_at;
    new.created_at      := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists found_persons_prepare on public.found_persons;
create trigger found_persons_prepare
  before insert or update on public.found_persons
  for each row execute function public.prepare_found_person();

-- Private photo bucket: finders upload into their own folder; finder + staff can view
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('found-photos', 'found-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Users upload found photos to own folder" on storage.objects;
create policy "Users upload found photos to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'found-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Finder and staff view found photos" on storage.objects;
create policy "Finder and staff view found photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'found-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

-- ---- backend helpers (secret key only) ----

-- Found reports whose photo hasn't been checked yet
create or replace function public.found_needing_faces(p_limit int default 10)
returns table (found_id uuid, photo_path text)
language sql stable security definer set search_path = public
as $$
  select id, photo_path from found_persons
  where face_checked_at is null
  order by created_at
  limit p_limit;
$$;

-- Open reports to compare again because a newer missing case has appeared
create or replace function public.found_needing_recheck(p_limit int default 20)
returns table (found_id uuid, embedding text)
language sql stable security definer set search_path = public, extensions
as $$
  select f.id, ff.embedding::text
  from found_persons f
  join found_faces ff on ff.found_id = f.id
  where f.status = 'open'
    and ff.embedding is not null
    and f.face_checked_at is not null
    and exists (select 1 from case_faces c where c.computed_at > f.face_checked_at and c.embedding is not null)
  limit p_limit;
$$;

-- Likely matches (score >= 0.70) that police haven't been told about, with
-- every police/admin phone and the finder's phone.
create or replace function public.pending_match_notices(p_limit int default 200)
returns table (found_id uuid, full_name text, score real, fcm_token text, for_finder boolean)
language sql stable security definer set search_path = public
as $$
  with todo as (
    select f.id, f.reported_by, f.match_score, m.full_name
    from found_persons f
    join missing_persons m on m.id = f.match_case_id
    where f.notified_at is null and f.match_score >= 0.70
  )
  select t.id, t.full_name, t.match_score, a.fcm_token, false
  from todo t
  join profiles p on p.role in ('police', 'admin')
  join alert_subscriptions a on a.user_id = p.id and a.fcm_token is not null
  union all
  select t.id, t.full_name, t.match_score, a.fcm_token, true
  from todo t
  join alert_subscriptions a on a.user_id = t.reported_by and a.fcm_token is not null
  union all
  select t.id, t.full_name, t.match_score, null, false from todo t   -- so nobody-to-tell still gets marked
  limit p_limit;
$$;

create or replace function public.mark_match_notified(p_ids uuid[])
returns void
language sql security definer set search_path = public
as $$
  update found_persons set notified_at = now() where id = any(p_ids);
$$;

revoke all on function public.found_needing_faces(int) from public, anon, authenticated;
revoke all on function public.found_needing_recheck(int) from public, anon, authenticated;
revoke all on function public.pending_match_notices(int) from public, anon, authenticated;
revoke all on function public.mark_match_notified(uuid[]) from public, anon, authenticated;
grant execute on function public.found_needing_faces(int) to service_role;
grant execute on function public.found_needing_recheck(int) to service_role;
grant execute on function public.pending_match_notices(int) to service_role;
grant execute on function public.mark_match_notified(uuid[]) to service_role;

-- The backend uses the secret key; make sure it can use the new tables
grant all on public.found_persons, public.found_faces to service_role;

-- Live updates for the police "Found persons" screen
do $$
begin
  alter publication supabase_realtime add table public.found_persons;
exception when duplicate_object then null;
end $$;

-- Done! You should see "Success. No rows returned".
