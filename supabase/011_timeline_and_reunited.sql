-- =====================================================================
--  011: Case timeline + "Reunited" notifications.
--
--  1. case_timeline(case id): the story of a case, for the case page:
--       reported -> approved -> alerts at 2/5/10 km -> sightings -> found
--     Safe for the public: only times and counts, no names or locations
--     of the people who were alerted or who reported sightings.
--
--  2. When a case is marked FOUND, the backend tells the family and
--     everyone who got an alert for it: "<name> has been found".
--     found_notified_at remembers that this was done (so it's sent once).
--
--  Paste into SQL Editor -> Run. Expect "Success. No rows returned".
-- =====================================================================

alter table public.missing_persons
  add column if not exists found_notified_at timestamptz;

-- ---------------------------------------------------------------------
-- 1. The timeline
-- ---------------------------------------------------------------------
create or replace function public.case_timeline(p_case uuid)
returns table (kind text, at timestamptz, radius_km int, people int)
language plpgsql stable security definer set search_path = public
as $$
declare
  c record;
begin
  select id, status, reported_by, created_at, verified_at, found_at
    into c from missing_persons where id = p_case;
  if not found then
    return;
  end if;

  -- Same visibility as the case itself: public cases (active/found),
  -- or the family who reported it, or police/admin.
  if not (c.status in ('active', 'found') or c.reported_by = auth.uid() or public.is_staff()) then
    return;
  end if;

  return query
    select 'reported'::text, c.created_at, null::int, null::int
    union all
    select 'approved', c.verified_at, null, null
      where c.verified_at is not null and c.status <> 'rejected'
    union all
    -- one row per alert zone: when it started and how many phones were alerted
    select 'alerts', min(l.sent_at), l.radius_km, count(*)::int
      from alert_log l
      where l.case_id = c.id and l.channel in ('push', 'sms')
      group by l.radius_km
    union all
    select 'sighting', s.created_at, null, null
      from sightings s
      where s.case_id = c.id and s.review_status <> 'dismissed'
    union all
    select 'found', c.found_at, null, null
      where c.found_at is not null
    order by 2;
end;
$$;
revoke all on function public.case_timeline(uuid) from public;
grant execute on function public.case_timeline(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. "Found" notifications (only the backend may use these)
-- ---------------------------------------------------------------------
-- Cases found in the last 7 days that haven't been announced yet, with every
-- phone to tell: the family's phones + every phone that got an alert.
-- A case with nobody to tell still comes back once (fcm_token null), so the
-- backend can mark it as done.
create or replace function public.pending_found_notices(p_limit int default 500)
returns table (case_id uuid, full_name text, subscription_id uuid, fcm_token text)
language sql stable security definer set search_path = public
as $$
  with todo as (
    select m.id, m.full_name, m.reported_by
    from missing_persons m
    where m.status = 'found'
      and m.found_notified_at is null
      and m.found_at > now() - interval '7 days'
  ),
  phones as (
    select t.id as case_id, s.id as subscription_id, s.fcm_token
    from todo t
    join alert_subscriptions s on s.user_id = t.reported_by
    where s.fcm_token is not null
    union
    select t.id, s.id, s.fcm_token
    from todo t
    join alert_log l on l.case_id = t.id
    join alert_subscriptions s on s.id = l.subscription_id
    where s.fcm_token is not null
  )
  select t.id, t.full_name, p.subscription_id, p.fcm_token
  from todo t
  left join phones p on p.case_id = t.id
  limit p_limit;
$$;

create or replace function public.mark_found_notified(p_ids uuid[])
returns void
language sql security definer set search_path = public
as $$
  update missing_persons set found_notified_at = now()
  where id = any(p_ids) and status = 'found';
$$;

revoke all on function public.pending_found_notices(int) from public, anon, authenticated;
revoke all on function public.mark_found_notified(uuid[]) from public, anon, authenticated;
grant execute on function public.pending_found_notices(int) to service_role;
grant execute on function public.mark_found_notified(uuid[]) to service_role;

-- Only the backend may set found_notified_at (phones can't fake "already told").
-- NOT security definer on purpose: it must see who is really making the change.
create or replace function public.guard_found_notified()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if not public.is_trusted_backend() then
    new.found_notified_at := old.found_notified_at;
  end if;
  return new;
end;
$$;
drop trigger if exists missing_persons_guard_found_notified on public.missing_persons;
create trigger missing_persons_guard_found_notified
  before update on public.missing_persons
  for each row execute function public.guard_found_notified();
