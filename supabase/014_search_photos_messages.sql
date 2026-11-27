-- =====================================================================
--  014: Search party + more photos per case + police-family messages
--
--  1. SEARCH PARTY: volunteers tap "I searched here". The case page map
--     shows the checked areas, so nobody searches the same street twice.
--     Who searched is never shown, only where and when.
--  2. MORE PHOTOS: the family/police add up to 5 extra photos to a case.
--     The AI compares sightings and "found someone" photos with ALL of them.
--  3. MESSAGES: a private chat on each case between the family who
--     reported it and the police. The other side gets a push.
--
--  Paste into SQL Editor -> Run. Expect "Success. No rows returned".
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. SEARCH PARTY
-- ---------------------------------------------------------------------
create table if not exists public.search_checks (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.missing_persons (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);
create index if not exists search_checks_case_idx on public.search_checks (case_id, created_at desc);
alter table public.search_checks enable row level security;

-- Everyone may see WHERE was searched (not who): only these columns are readable
revoke all on public.search_checks from anon, authenticated;
grant select (id, case_id, lat, lng, created_at) on public.search_checks to anon, authenticated;
grant insert (case_id, lat, lng) on public.search_checks to authenticated;

drop policy if exists "Anyone sees searched areas of public cases" on public.search_checks;
create policy "Anyone sees searched areas of public cases"
  on public.search_checks for select to anon, authenticated
  using (exists (select 1 from missing_persons m where m.id = case_id and m.status in ('active', 'found')));

drop policy if exists "Logged-in users mark searched areas of active cases" on public.search_checks;
create policy "Logged-in users mark searched areas of active cases"
  on public.search_checks for insert to authenticated
  with check (exists (select 1 from missing_persons m where m.id = case_id and m.status = 'active'));

-- fill in who/when; at most one mark per person every 2 minutes
create or replace function public.prepare_search_check()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_trusted_backend() then return new; end if;
  new.user_id := auth.uid();
  new.created_at := now();
  if exists (select 1 from search_checks
             where user_id = auth.uid() and case_id = new.case_id and created_at > now() - interval '2 minutes') then
    raise exception 'Please wait 2 minutes before marking another area.';
  end if;
  return new;
end;
$$;
drop trigger if exists search_checks_prepare on public.search_checks;
create trigger search_checks_prepare before insert on public.search_checks
  for each row execute function public.prepare_search_check();

-- Volunteers in the last 24 h (a count only, nobody's identity)
create or replace function public.search_volunteers(p_case uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select count(distinct user_id)::int from search_checks
  where case_id = p_case and created_at > now() - interval '1 day';
$$;
grant execute on function public.search_volunteers(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. MORE PHOTOS PER CASE
-- ---------------------------------------------------------------------
create table if not exists public.case_photos (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.missing_persons (id) on delete cascade,
  photo_path text not null,                -- inside the public "case-photos" bucket
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists case_photos_case_idx on public.case_photos (case_id);
alter table public.case_photos enable row level security;

-- the same people who can see the case can see its photos
drop policy if exists "Case photos follow case visibility" on public.case_photos;
create policy "Case photos follow case visibility"
  on public.case_photos for select to anon, authenticated
  using (exists (
    select 1 from missing_persons m where m.id = case_id
      and (m.status in ('active', 'found') or m.reported_by = auth.uid() or public.is_staff())));

drop policy if exists "Reporter or staff add case photos" on public.case_photos;
create policy "Reporter or staff add case photos"
  on public.case_photos for insert to authenticated
  with check (exists (
    select 1 from missing_persons m where m.id = case_id
      and (m.reported_by = auth.uid() or public.is_staff())));

drop policy if exists "Reporter or staff remove case photos" on public.case_photos;
create policy "Reporter or staff remove case photos"
  on public.case_photos for delete to authenticated
  using (exists (
    select 1 from missing_persons m where m.id = case_id
      and (m.reported_by = auth.uid() or public.is_staff())));

create or replace function public.prepare_case_photo()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_trusted_backend() then return new; end if;
  if (select count(*) from case_photos where case_id = new.case_id) >= 5 then
    raise exception 'A case can have at most 5 extra photos.';
  end if;
  new.added_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists case_photos_prepare on public.case_photos;
create trigger case_photos_prepare before insert on public.case_photos
  for each row execute function public.prepare_case_photo();

-- the face "fingerprint" of each extra photo (backend only)
create table if not exists public.case_photo_faces (
  photo_id    uuid primary key references public.case_photos (id) on delete cascade,
  case_id     uuid not null references public.missing_persons (id) on delete cascade,
  embedding   extensions.vector(512),
  error       text,
  computed_at timestamptz not null default now()
);
alter table public.case_photo_faces enable row level security;
revoke all on public.case_photo_faces from anon, authenticated;

create or replace function public.case_photos_needing_faces(p_limit int default 10)
returns table (photo_id uuid, case_id uuid, photo_path text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.case_id, p.photo_path from case_photos p
  where not exists (select 1 from case_photo_faces f where f.photo_id = p.id)
  order by p.created_at
  limit p_limit;
$$;

-- "Who is this?" / found-someone matching now uses EVERY photo of a case:
-- each case scores its best (closest) photo.
create or replace function public.match_case_faces(p_embedding text, p_limit int default 5)
returns table (
  case_id           uuid,
  full_name         text,
  age               int,
  photo_path        text,
  last_seen_at      timestamptz,
  last_seen_address text,
  similarity        double precision
)
language sql stable security definer set search_path = public, extensions
as $$
  with all_faces as (
    select f.case_id, f.embedding from case_faces f
    join missing_persons m on m.id = f.case_id
    where f.embedding is not null and f.photo_path = m.photo_path
    union all
    select pf.case_id, pf.embedding from case_photo_faces pf where pf.embedding is not null
  ),
  best as (
    select case_id, max(1 - (embedding <=> p_embedding::vector(512))) as similarity
    from all_faces group by case_id
  )
  select m.id, m.full_name, m.age, m.photo_path, m.last_seen_at, m.last_seen_address, b.similarity
  from best b
  join missing_persons m on m.id = b.case_id
  where m.status = 'active'
  order by b.similarity desc
  limit least(p_limit, 20);
$$;

-- every face fingerprint of one case (for comparing sighting photos)
create or replace function public.case_embeddings(p_case uuid)
returns table (embedding text)
language sql stable security definer set search_path = public, extensions
as $$
  select f.embedding::text from case_faces f where f.case_id = p_case and f.embedding is not null
  union all
  select pf.embedding::text from case_photo_faces pf where pf.case_id = p_case and pf.embedding is not null;
$$;

revoke all on function public.case_photos_needing_faces(int) from public, anon, authenticated;
revoke all on function public.match_case_faces(text, int) from public, anon, authenticated;
revoke all on function public.case_embeddings(uuid) from public, anon, authenticated;
grant execute on function public.case_photos_needing_faces(int) to service_role;
grant execute on function public.match_case_faces(text, int) to service_role;
grant execute on function public.case_embeddings(uuid) to service_role;


-- ---------------------------------------------------------------------
-- 3. POLICE - FAMILY MESSAGES
-- ---------------------------------------------------------------------
create table if not exists public.case_messages (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.missing_persons (id) on delete cascade,
  sender_id   uuid references public.profiles (id) on delete set null,
  from_police boolean not null default false,
  body        text not null check (char_length(body) between 1 and 1000),
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists case_messages_case_idx on public.case_messages (case_id, created_at);
alter table public.case_messages enable row level security;

drop policy if exists "Family and staff read case messages" on public.case_messages;
create policy "Family and staff read case messages"
  on public.case_messages for select to authenticated
  using (public.is_staff() or exists (select 1 from missing_persons m where m.id = case_id and m.reported_by = auth.uid()));

drop policy if exists "Family and staff write case messages" on public.case_messages;
create policy "Family and staff write case messages"
  on public.case_messages for insert to authenticated
  with check (public.is_staff() or exists (select 1 from missing_persons m where m.id = case_id and m.reported_by = auth.uid()));

create or replace function public.prepare_case_message()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_trusted_backend() then return new; end if;
  new.sender_id   := auth.uid();
  new.from_police := public.is_staff();
  new.notified_at := null;
  new.created_at  := now();
  if (select count(*) from case_messages
      where sender_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Too many messages. Please wait a minute.';
  end if;
  return new;
end;
$$;
drop trigger if exists case_messages_prepare on public.case_messages;
create trigger case_messages_prepare before insert on public.case_messages
  for each row execute function public.prepare_case_message();

-- new messages to announce: police messages go to the family's phones,
-- family messages go to every police/admin phone
create or replace function public.pending_message_notices(p_limit int default 200)
returns table (message_id uuid, case_id uuid, full_name text, from_police boolean, body text, fcm_token text)
language sql stable security definer set search_path = public
as $$
  with todo as (
    select x.id, x.case_id, x.from_police, x.body, x.sender_id, m.full_name, m.reported_by
    from case_messages x join missing_persons m on m.id = x.case_id
    where x.notified_at is null and x.created_at > now() - interval '1 day'
  )
  select t.id, t.case_id, t.full_name, t.from_police, t.body, a.fcm_token
  from todo t
  join alert_subscriptions a on a.fcm_token is not null
   and ((t.from_police and a.user_id = t.reported_by)
        or (not t.from_police and a.user_id in (select id from profiles where role in ('police', 'admin'))))
   and a.user_id is distinct from t.sender_id
  union all
  select t.id, t.case_id, t.full_name, t.from_police, t.body, null from todo t
  limit p_limit;
$$;

create or replace function public.mark_message_notified(p_ids uuid[])
returns void
language sql security definer set search_path = public
as $$
  update case_messages set notified_at = now() where id = any(p_ids);
$$;

revoke all on function public.pending_message_notices(int) from public, anon, authenticated;
revoke all on function public.mark_message_notified(uuid[]) from public, anon, authenticated;
grant execute on function public.pending_message_notices(int) to service_role;
grant execute on function public.mark_message_notified(uuid[]) to service_role;

grant all on public.search_checks, public.case_photos, public.case_photo_faces, public.case_messages to service_role;

-- live updates: new messages appear by themselves
do $$
begin
  begin alter publication supabase_realtime add table public.case_messages; exception when duplicate_object then null; end;
end $$;

-- Done! You should see "Success. No rows returned".
