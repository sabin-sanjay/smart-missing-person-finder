-- =====================================================================
--  Step 8: PUSH ALERTS: database part
--  Run AFTER 001-003. (SQL Editor -> New query -> paste -> Run)
--
--  Adds:
--    1. alert_subscriptions — phones that want alerts + their last location
--    2. alert_log           — who was already alerted for which case
--                             (so nobody gets the same alert twice)
--    3. save_alert_subscription()  — the app calls this to sign up / update location
--    4. advance_alert_radii()      — backend: grow 2 km -> 5 km -> 10 km over time
--    5. pending_alert_recipients() — backend: who should get an alert right now
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. alert_subscriptions
--    One row per phone (identified by its Firebase push "token").
--    A logged-in user who blocks notifications can still get SMS:
--    their row has no token (fcm_token is null), only a location.
-- ---------------------------------------------------------------------
create table if not exists public.alert_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete cascade, -- null if not logged in
  fcm_token  text unique check (char_length(fcm_token) <= 500),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  location   extensions.geography(Point, 4326)
               generated always as (
                 extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
               ) stored,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- At most ONE "SMS only" (no token) row per user
create unique index if not exists alert_subscriptions_sms_only_idx
  on public.alert_subscriptions (user_id) where fcm_token is null;
create index if not exists alert_subscriptions_location_idx
  on public.alert_subscriptions using gist (location);

-- Security: RLS ON and NO policies = phones can't read or change this table
-- directly (it holds everyone's location!). They can only use the
-- save_alert_subscription() function below. The backend's secret key bypasses RLS.
alter table public.alert_subscriptions enable row level security;
revoke all on public.alert_subscriptions from anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. alert_log: one row per (case, subscription) once alerted
-- ---------------------------------------------------------------------
create table if not exists public.alert_log (
  id              bigint generated always as identity primary key,
  case_id         uuid not null references public.missing_persons (id) on delete cascade,
  subscription_id uuid references public.alert_subscriptions (id) on delete set null,
  user_id         uuid references public.profiles (id) on delete set null,
  channel         text not null check (channel in ('push', 'sms', 'failed')),
  radius_km       int not null,
  error           text,
  sent_at         timestamptz not null default now(),
  unique (case_id, subscription_id)
);
create index if not exists alert_log_case_user_idx on public.alert_log (case_id, user_id);

alter table public.alert_log enable row level security;
revoke all on public.alert_log from anon, authenticated;

-- Police/admin may READ the log (e.g. "how many people were alerted?")
grant select on public.alert_log to authenticated;
drop policy if exists "Staff read alert log" on public.alert_log;
create policy "Staff read alert log"
  on public.alert_log for select to authenticated
  using (public.is_staff());


-- ---------------------------------------------------------------------
-- 3. save_alert_subscription: the app calls this when the user turns on
--    alerts, and again now and then to update their location.
--      supabase.rpc('save_alert_subscription', { p_token, p_lat, p_lng })
--    p_token = the Firebase token, or null for "SMS only" (logged-in users only)
-- ---------------------------------------------------------------------
create or replace function public.save_alert_subscription(
  p_token text,
  p_lat   double precision,
  p_lng   double precision
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_token is not null then
    insert into alert_subscriptions (user_id, fcm_token, lat, lng)
    values (auth.uid(), p_token, p_lat, p_lng)
    on conflict (fcm_token) do update
      set lat = excluded.lat,
          lng = excluded.lng,
          user_id = coalesce(auth.uid(), alert_subscriptions.user_id),
          updated_at = now();

    -- This user now has push, so remove their SMS-only row if any
    if auth.uid() is not null then
      delete from alert_subscriptions where user_id = auth.uid() and fcm_token is null;
    end if;

  elsif auth.uid() is not null then
    insert into alert_subscriptions (user_id, fcm_token, lat, lng)
    values (auth.uid(), null, p_lat, p_lng)
    on conflict (user_id) where fcm_token is null do update
      set lat = excluded.lat, lng = excluded.lng, updated_at = now();

  else
    raise exception 'Please log in (with a phone number) to get SMS alerts.';
  end if;
end;
$$;

revoke all on function public.save_alert_subscription(text, double precision, double precision) from public;
grant execute on function public.save_alert_subscription(text, double precision, double precision) to anon, authenticated;

-- Lets the app turn alerts OFF for this phone
create or replace function public.remove_alert_subscription(p_token text)
returns void
language sql security definer set search_path = public
as $$
  delete from alert_subscriptions
  where (p_token is not null and fcm_token = p_token)
     or (p_token is null and auth.uid() is not null and user_id = auth.uid() and fcm_token is null);
$$;

revoke all on function public.remove_alert_subscription(text) from public;
grant execute on function public.remove_alert_subscription(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. advance_alert_radii (BACKEND ONLY)
--    Active cases at 2 km for longer than p_to5_minutes  -> 5 km
--    Active cases at 5 km for longer than p_to10_minutes -> 10 km
--    Found/rejected cases are never touched, so their alerts stop.
-- ---------------------------------------------------------------------
create or replace function public.advance_alert_radii(p_to5_minutes int, p_to10_minutes int)
returns void
language sql security definer set search_path = public
as $$
  update missing_persons
  set alert_radius_km = case alert_radius_km when 2 then 5 else 10 end,
      alert_radius_updated_at = now()
  where status = 'active'
    and (
      (alert_radius_km = 2 and coalesce(alert_radius_updated_at, verified_at, created_at) <= now() - make_interval(mins => p_to5_minutes))
      or
      (alert_radius_km = 5 and coalesce(alert_radius_updated_at, verified_at, created_at) <= now() - make_interval(mins => p_to10_minutes))
    );
$$;

revoke all on function public.advance_alert_radii(int, int) from public, anon, authenticated;
grant execute on function public.advance_alert_radii(int, int) to service_role;


-- ---------------------------------------------------------------------
-- 5. pending_alert_recipients (BACKEND ONLY)
--    Every (active case, subscription) pair where the phone is inside the
--    case's current alert circle and hasn't been alerted for it yet.
--    Ignores locations older than 14 days and the family who reported it.
-- ---------------------------------------------------------------------
create or replace function public.pending_alert_recipients(p_limit int default 500)
returns table (
  case_id           uuid,
  full_name         text,
  age               int,
  photo_path        text,
  last_seen_at      timestamptz,
  last_seen_address text,
  alert_radius_km   int,
  subscription_id   uuid,
  fcm_token         text,
  user_id           uuid,
  phone             text,
  sms_already_sent  boolean,
  distance_km       double precision
)
language sql stable security definer set search_path = public, extensions
as $$
  select
    m.id, m.full_name, m.age, m.photo_path, m.last_seen_at, m.last_seen_address, m.alert_radius_km,
    s.id, s.fcm_token, s.user_id, p.phone,
    exists (
      select 1 from alert_log l
      where l.case_id = m.id and l.user_id = s.user_id and l.channel = 'sms'
    ),
    st_distance(m.last_seen_location, s.location) / 1000
  from missing_persons m
  join alert_subscriptions s
    on st_dwithin(m.last_seen_location, s.location, m.alert_radius_km * 1000)
  left join profiles p on p.id = s.user_id
  where m.status = 'active'
    and s.updated_at > now() - interval '14 days'
    and (m.reported_by is null or s.user_id is distinct from m.reported_by)
    and not exists (
      select 1 from alert_log l where l.case_id = m.id and l.subscription_id = s.id
    )
  order by m.verified_at, 13
  limit p_limit;
$$;

revoke all on function public.pending_alert_recipients(int) from public, anon, authenticated;
grant execute on function public.pending_alert_recipients(int) to service_role;

-- Done! You should see "Success. No rows returned".
