-- =====================================================================
--  Step 9: call the backend automatically every 2 minutes.
--  Run this ONLY AFTER the backend is online on Hugging Face.
--
--  pg_cron = a timer inside the database
--  pg_net  = lets the database call a web address
--
--  BEFORE RUNNING: replace the two placeholders below:
--    YOUR-SPACE-URL   e.g. https://yourname-missing-person-finder.hf.space
--    YOUR-CRON-SECRET the same CRON_SECRET you set in the Space's secrets
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Remove an older copy of the job if this file is run again
select cron.unschedule('run-backend-worker')
where exists (select 1 from cron.job where jobname = 'run-backend-worker');

-- Every 2 minutes: POST to /worker/run (face matching + alerts).
-- This also keeps the free Hugging Face Space awake.
select cron.schedule(
  'run-backend-worker',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := 'YOUR-SPACE-URL/worker/run',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', 'YOUR-CRON-SECRET'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Check: should list the job
select jobname, schedule, active from cron.job;

-- Later, to see whether the calls worked (status_code 200 = good):
--   select status_code, created, content from net._http_response order by created desc limit 10;
-- To stop the timer:
--   select cron.unschedule('run-backend-worker');
