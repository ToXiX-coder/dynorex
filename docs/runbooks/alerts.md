# Alerts to configure before release (spec 15.2)

| Alert                    | Source                                                                                                         | Threshold                             | First response                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| Crash-free sessions      | Sentry release health                                                                                          | < 99.5 % over 24 h (blocks rollout)   | Halt rollout, triage top issue          |
| New crash in release     | Sentry                                                                                                         | Any issue > 50 users in 1 h           | Triage; rollback if S1/S2               |
| API errors               | Supabase logs (PostgREST 5xx)                                                                                  | > 1 % of requests over 15 min         | Check recent migration/function deploys |
| Latency regression       | Sentry `app.perf` spans / Supabase API p95                                                                     | p95 > 500 ms or +50 % vs last release | Compare with `npm run perf:db`          |
| Auth failures            | Supabase Auth logs                                                                                             | Sign-in errors > 3× baseline          | Check providers, SMTP, rate limits      |
| Upload failures          | Sentry breadcrumb counts / register-photo 4xx-5xx                                                              | > 5 % over 1 h                        | Storage status, function logs           |
| Webhook failures         | revenuecat-webhook non-200                                                                                     | Any 5xx for 10 min                    | RevenueCat retries; check secret and DB |
| Push backlog             | `select count(*) from notifications where push_sent_at is null and created_at < now() - interval '15 minutes'` | > 0 for 15 min                        | Scheduler job / EXPO_ACCESS_TOKEN       |
| Subscription sync errors | subscription-sync 5xx                                                                                          | > 2 %                                 | RevenueCat status / secret key          |
| Report volume            | `reports` with status open                                                                                     | > 50 open or any open > 48 h          | Moderator rota                          |

Sentry receives no PII by design (scrubbers in `src/services/monitoring/sentryOptions.ts`); trace ids are
random. Don't add user emails or usernames to alerts or dashboards.
