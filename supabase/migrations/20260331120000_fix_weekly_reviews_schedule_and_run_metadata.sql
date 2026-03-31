-- Ensure weekly review automation runs are traceable by scheduled trigger time
ALTER TABLE public.review_automation_runs
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

COMMENT ON COLUMN public.review_automation_runs.scheduled_for IS
  'Timestamp when the scheduler attempted the weekly automation run for this venue.';

-- Schedule the weekly review scheduler to run hourly.
-- Each invocation only processes venues whose local time is Monday 08:xx.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-weekly-reviews-schedule-hourly') THEN
    PERFORM cron.unschedule('run-weekly-reviews-schedule-hourly');
  END IF;

  PERFORM cron.schedule(
    'run-weekly-reviews-schedule-hourly',
    '0 * * * *',
    $job$
    SELECT
      net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/run-weekly-reviews-schedule',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
      );
    $job$
  );
END;
$do$;
