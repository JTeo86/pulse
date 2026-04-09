ALTER TABLE public.venue_weekly_briefs
  ADD COLUMN IF NOT EXISTS pulse_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pulse_activity jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

COMMENT ON COLUMN public.venue_weekly_briefs.pulse_report IS
  'Structured weekly Pulse report payload for fast in-app rendering.';

COMMENT ON COLUMN public.venue_weekly_briefs.pulse_activity IS
  'Short bullet list of notable Pulse activity this week.';

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-weekly-pulse-schedule-hourly') THEN
    PERFORM cron.unschedule('run-weekly-pulse-schedule-hourly');
  END IF;

  PERFORM cron.schedule(
    'run-weekly-pulse-schedule-hourly',
    '0 * * * *',
    $job$
    SELECT
      net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/run-weekly-pulse-schedule',
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
