-- =====================================================================
--  Step 9: FACE MATCHING: database part
--  Run AFTER 001-004. (SQL Editor -> New query -> paste -> Run)
--
--  A "face embedding" is a list of 512 numbers that describes a face.
--  Two photos of the same person give similar lists. We store one per
--  case photo and compare sighting photos against it.
-- =====================================================================

-- pgvector: lets Postgres store and compare those 512-number lists quickly
create extension if not exists vector with schema extensions;


-- ---------------------------------------------------------------------
-- 1. case_faces: the face embedding of each case photo
-- ---------------------------------------------------------------------
create table if not exists public.case_faces (
  case_id     uuid primary key references public.missing_persons (id) on delete cascade,
  photo_path  text not null,                 -- which photo it was made from
  embedding   extensions.vector(512),        -- null if no face was found in the photo
  error       text,                          -- e.g. "no face found"
  computed_at timestamptz not null default now()
);

-- Only the backend (secret key) may touch this table
alter table public.case_faces enable row level security;
revoke all on public.case_faces from anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Extra sighting columns: when the face check ran, and any problem
-- ---------------------------------------------------------------------
alter table public.sightings add column if not exists face_checked_at timestamptz;
alter table public.sightings add column if not exists face_error text;

-- Update the "new sighting" trigger so users can't fill these in themselves
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
    new.face_checked_at  := null;
    new.face_error       := null;
  end if;
  new.created_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Backend helpers (secret key only)
-- ---------------------------------------------------------------------

-- Cases (pending or active) whose photo hasn't been turned into an embedding yet
create or replace function public.cases_needing_faces(p_limit int default 10)
returns table (case_id uuid, photo_path text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.photo_path
  from missing_persons m
  where m.status in ('pending', 'active')
    and m.photo_path is not null
    and not exists (
      select 1 from case_faces f where f.case_id = m.id and f.photo_path = m.photo_path
    )
  order by m.created_at
  limit p_limit;
$$;

-- Sightings with a photo that haven't been face-checked yet, whose case
-- embedding is ready (case_embedding is null if the case photo had no face)
create or replace function public.sightings_needing_faces(p_limit int default 20)
returns table (sighting_id uuid, photo_path text, case_id uuid, case_embedding text)
language sql stable security definer set search_path = public
as $$
  select s.id, s.photo_path, s.case_id, f.embedding::text
  from sightings s
  join case_faces f on f.case_id = s.case_id
  where s.photo_path is not null
    and s.face_checked_at is null
  order by s.created_at
  limit p_limit;
$$;

-- "Who is this?": the active cases whose face is most similar to a photo.
-- similarity: 1.0 = identical, around 0.7+ = probably the same person.
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
  select m.id, m.full_name, m.age, m.photo_path, m.last_seen_at, m.last_seen_address,
         1 - (f.embedding <=> p_embedding::vector(512))   -- <=> is "cosine distance"
  from case_faces f
  join missing_persons m on m.id = f.case_id
  where m.status = 'active'
    and f.embedding is not null
    and f.photo_path = m.photo_path
  order by f.embedding <=> p_embedding::vector(512)
  limit least(p_limit, 20);
$$;

revoke all on function public.cases_needing_faces(int) from public, anon, authenticated;
revoke all on function public.sightings_needing_faces(int) from public, anon, authenticated;
revoke all on function public.match_case_faces(text, int) from public, anon, authenticated;
grant execute on function public.cases_needing_faces(int) to service_role;
grant execute on function public.sightings_needing_faces(int) to service_role;
grant execute on function public.match_case_faces(text, int) to service_role;

-- Done! You should see "Success. No rows returned".
