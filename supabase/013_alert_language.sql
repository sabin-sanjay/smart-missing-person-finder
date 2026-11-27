-- =====================================================================
--  013: Notifications in each person's own language
--
--  Each phone that turned on alerts now remembers the app language
--  (English, Hindi, Tamil, Malayalam, Telugu). The backend writes every
--  notification ("Missing: ...", "has been found", sightings, matches)
--  in that language.
--
--  Paste into SQL Editor -> Run. Expect "Success. No rows returned".
-- =====================================================================

alter table public.alert_subscriptions
  add column if not exists language text not null default 'en'
  check (language in ('en', 'hi', 'ta', 'ml', 'te'));

-- The app calls this when alerts are turned on and when the language changes.
-- Only the phone that owns the (secret) push token can change its own row.
create or replace function public.set_alert_language(p_token text, p_lang text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_token is null or p_lang not in ('en', 'hi', 'ta', 'ml', 'te') then
    return;
  end if;
  update alert_subscriptions set language = p_lang where fcm_token = p_token;
end;
$$;

revoke all on function public.set_alert_language(text, text) from public;
grant execute on function public.set_alert_language(text, text) to anon, authenticated;

-- Done! You should see "Success. No rows returned".
