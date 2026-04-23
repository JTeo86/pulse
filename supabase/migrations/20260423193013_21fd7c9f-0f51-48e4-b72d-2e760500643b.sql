ALTER TABLE public.review_automation_runs
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

COMMENT ON COLUMN public.review_automation_runs.scheduled_for IS
  'Timestamp when the scheduler attempted the weekly automation run for this venue.';

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reviews-schedule-hourly') THEN
    PERFORM cron.unschedule('weekly-reviews-schedule-hourly');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-weekly-reviews-schedule-hourly') THEN
    PERFORM cron.unschedule('run-weekly-reviews-schedule-hourly');
  END IF;

  PERFORM cron.schedule(
    'run-weekly-reviews-schedule-hourly',
    '0 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/run-weekly-reviews-schedule',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{}'::jsonb
    ) AS request_id;
    $job$
  );
END;
$do$;