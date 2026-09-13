-- Replace the TWO placeholders locally in Supabase SQL Editor, never in GitHub.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'nezhno_project_url');
select vault.create_secret('YOUR_RANDOM_CRON_SECRET_AT_LEAST_32_CHARACTERS', 'nezhno_cron_secret');

-- Safe to recreate the named job; Vault secrets above should only be created once.
select cron.unschedule(jobid) from cron.job where jobname = 'nezhno-reminders';
select cron.schedule('nezhno-reminders', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'nezhno_project_url') || '/functions/v1/care-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'nezhno_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);
