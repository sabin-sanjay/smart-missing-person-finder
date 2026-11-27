-- =====================================================================
--  010: Fix: phones that are NOT logged in were skipped for cases that
--  have no reporter (e.g. cases added directly by an admin in SQL).
--
--  The rule "don't alert the person who reported the case" compared
--  "no user" with "no reporter" and treated them as the same person.
--  Now the rule only applies when the case HAS a reporter.
--
--  Paste into SQL Editor -> Run. Expect "Success. No rows returned".
-- =====================================================================

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
    -- don't alert the reporter about their own case (only if the case has a reporter)
    and (m.reported_by is null or s.user_id is distinct from m.reported_by)
    and not exists (
      select 1 from alert_log l where l.case_id = m.id and l.subscription_id = s.id
    )
  order by m.verified_at, 13
  limit p_limit;
$$;
revoke all on function public.pending_alert_recipients(int) from public, anon, authenticated;
grant execute on function public.pending_alert_recipients(int) to service_role;
