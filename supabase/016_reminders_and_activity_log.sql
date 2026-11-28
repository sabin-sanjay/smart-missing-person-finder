-- =====================================================================
--  016: "Still missing" reminders + police activity log
--
--  1. REMINDERS: while a case stays open, everyone who already got an
--     alert for it gets a short reminder once a day: "Still missing: <name>".
--  2. ACTIVITY LOG: an automatic record on each case of who did what and
--     when (reported, approved, rejected, found, sightings reviewed,
--     photos, messages). Only police/admin can read it.
--
--  Paste into SQL Editor -> Run. Expect "Success. No rows returned".
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. REMINDERS
-- ---------------------------------------------------------------------
alter table public.missing_persons add column if not exists last_reminder_at timestamptz;

-- only the backend may set it
create or replace function public.guard_last_reminder()
returns trigger
language plpgsql set search_path = public   -- NOT security definer on purpose
as $$
begin
  if not public.is_trusted_backend() then
    new.last_reminder_at := old.last_reminder_at;
  end if;
  return new;
end;
$$;
drop trigger if exists missing_persons_guard_reminder on public.missing_persons;
create trigger missing_persons_guard_reminder
  before update on public.missing_persons
  for each row execute function public.guard_last_reminder();

-- Cases open longer than p_after_minutes since approval (and since the last
-- reminder), with the phones that already got an alert for them.
-- A case with nobody to tell still comes back once (fcm_token null).
create or replace function public.pending_reminders(p_after_minutes int default 1440, p_limit int default 500)
returns table (case_id uuid, full_name text, age int, photo_path text, days int, fcm_token text)
language sql stable security definer set search_path = public
as $$
  with todo as (
    select m.id, m.full_name, m.age, m.photo_path,
           greatest(1, floor(extract(epoch from now() - m.verified_at) / 86400))::int as days
    from missing_persons m
    where m.status = 'active'
      and m.verified_at < now() - make_interval(mins => p_after_minutes)
      and coalesce(m.last_reminder_at, m.verified_at) < now() - make_interval(mins => p_after_minutes)
  )
  select t.id, t.full_name, t.age, t.photo_path, t.days, s.fcm_token
  from todo t
  join (select distinct l.case_id, l.subscription_id from alert_log l where l.channel = 'push') l on l.case_id = t.id
  join alert_subscriptions s on s.id = l.subscription_id and s.fcm_token is not null
  union all
  select t.id, t.full_name, t.age, t.photo_path, t.days, null from todo t
  limit p_limit;
$$;

create or replace function public.mark_reminded(p_ids uuid[])
returns void
language sql security definer set search_path = public
as $$
  update missing_persons set last_reminder_at = now() where id = any(p_ids);
$$;

revoke all on function public.pending_reminders(int, int) from public, anon, authenticated;
revoke all on function public.mark_reminded(uuid[]) from public, anon, authenticated;
grant execute on function public.pending_reminders(int, int) to service_role;
grant execute on function public.mark_reminded(uuid[]) to service_role;


-- ---------------------------------------------------------------------
-- 2. ACTIVITY LOG
-- ---------------------------------------------------------------------
create table if not exists public.case_activity (
  id         bigint generated always as identity primary key,
  case_id    uuid not null references public.missing_persons (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,  -- null = the system
  action     text not null,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists case_activity_case_idx on public.case_activity (case_id, created_at);
alter table public.case_activity enable row level security;

drop policy if exists "Staff read the activity log" on public.case_activity;
create policy "Staff read the activity log"
  on public.case_activity for select to authenticated
  using (public.is_staff());

-- nobody writes it directly: only the triggers below
revoke all on public.case_activity from anon, authenticated;
grant select on public.case_activity to authenticated;
grant all on public.case_activity to service_role;

-- helper used by the triggers (security definer so it can always write)
create or replace function public.log_activity(p_case uuid, p_action text, p_detail text default null)
returns void
language sql security definer set search_path = public
as $$
  insert into case_activity (case_id, actor_id, action, detail)
  values (p_case, auth.uid(), p_action, left(p_detail, 300));
$$;
revoke all on function public.log_activity(uuid, text, text) from public, anon, authenticated;

-- cases: reported / approved / rejected / found / alert zone grew
create or replace function public.activity_cases()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity(new.id, 'reported', new.full_name);
  else
    if new.status is distinct from old.status then
      perform log_activity(new.id,
        case new.status::text when 'active' then 'approved' else new.status::text end,
        case when new.status::text = 'rejected' then new.rejection_reason end);
    end if;
    if new.alert_radius_km is distinct from old.alert_radius_km then
      perform log_activity(new.id, 'alert_zone', new.alert_radius_km || ' km');
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists missing_persons_activity on public.missing_persons;
create trigger missing_persons_activity
  after insert or update on public.missing_persons
  for each row execute function public.activity_cases();

-- sightings: reported / confirmed / dismissed
create or replace function public.activity_sightings()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity(new.case_id, 'sighting_reported', left(new.notes, 120));
  elsif new.review_status is distinct from old.review_status then
    perform log_activity(new.case_id, 'sighting_' || new.review_status::text, null);
  end if;
  return null;
end;
$$;
drop trigger if exists sightings_activity on public.sightings;
create trigger sightings_activity
  after insert or update on public.sightings
  for each row execute function public.activity_sightings();

-- extra photos and messages
create or replace function public.activity_photos()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then perform log_activity(new.case_id, 'photo_added', null);
  elsif exists (select 1 from missing_persons where id = old.case_id) then  -- skip when the whole case is being deleted
    perform log_activity(old.case_id, 'photo_removed', null);
  end if;
  return null;
end;
$$;
drop trigger if exists case_photos_activity on public.case_photos;
create trigger case_photos_activity
  after insert or delete on public.case_photos
  for each row execute function public.activity_photos();

create or replace function public.activity_messages()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_activity(new.case_id, case when new.from_police then 'message_police' else 'message_family' end, null);
  return null;
end;
$$;
drop trigger if exists case_messages_activity on public.case_messages;
create trigger case_messages_activity
  after insert on public.case_messages
  for each row execute function public.activity_messages();

-- Done! You should see "Success. No rows returned".
