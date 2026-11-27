-- =====================================================================
--  009: A place where the backend publishes its current internet address.
--
--  Why: the backend runs on the laptop and is reached through a free
--  Cloudflare tunnel. The tunnel gets a NEW address every time it starts
--  (like https://some-random-words.trycloudflare.com). The backend writes
--  that address here, and the app reads it, so nobody has to update the
--  app by hand.
--
--  Anyone may READ it (it's just a web address).
--  Only the backend (secret key) may WRITE it.
--
--  Paste into SQL Editor -> Run. Expect "Success. No rows returned".
-- =====================================================================

create table if not exists public.app_config (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "Anyone can read app settings" on public.app_config;
create policy "Anyone can read app settings"
  on public.app_config for select
  to anon, authenticated
  using (true);

-- Reading only. No insert/update/delete policies, so the app can't change it.
grant select on public.app_config to anon, authenticated;
grant all    on public.app_config to service_role;

-- Start with an empty address
insert into public.app_config (key, value) values ('backend_url', '')
on conflict (key) do nothing;
