# Production operations

This runbook covers the operational layer around the official Postgres World.
It does not claim deployment-affinity, run deletion, or other control-plane
features that the stable World contract does not expose.

The Deploy to Heroku button creates a small demonstration formation. Choose a
dyno and Heroku Postgres plan from workload measurements and recovery needs;
do not infer a production size or availability target from `app.json`.

## Health and release signals

The example exposes two intentionally different health checks:

- `GET /health` is a public, cached readiness check. It performs a bounded
  storage read and returns `503` when Workflow storage cannot be reached.
- `GET /api/health/workflow` requires the operator bearer token and calls
  Workflow DevKit's official `healthCheck()` for both workflow and step queues.

On Heroku, the example refuses the operator page and all `/api/*` requests
unless the router reports HTTPS, and HTTPS responses include HSTS. Use the
platform HTTPS URL for every operator and monitoring request; Heroku does not
perform this redirect automatically.

Run the production doctor from a one-off dyno after changing formation,
database plan, credentials, or Workflow configuration:

```bash
heroku run workflow-heroku-doctor --strict --app "$HEROKU_APP_NAME"
```

Its JSON output reports storage access, pending and running workflow counts,
release version, non-secret configuration, and the declared connection budget.
Do not publish or persist the surrounding process environment.

The release phase runs the same doctor and then
`workflow-heroku-release-check`. The production policy is `block`: a failed
release leaves the currently running Heroku release in place. Use
`heroku releases` and `heroku releases:output` to inspect a pending or failed
release. The `warn` policy is diagnostic-only and is not a safe code-deployment
policy for this topology.

## Logs and durable monitoring

Application and dependency output goes to standard output and standard error,
where Heroku attaches the dyno and release context. Inspect it interactively:

```bash
heroku logs --source app --tail --app "$HEROKU_APP_NAME"
heroku logs --process-type postgres --tail --app "$HEROKU_APP_NAME"
```

Heroku's live log stream is not long-term storage. Configure a logging add-on,
log drain, or telemetry drain appropriate to the app's Heroku generation and
send alerts to an independently available destination. Never log workflow
inputs, outputs, hook payloads, API tokens, database URLs, or encryption keys.

At minimum, alert on:

| Signal | Warning condition | Required response |
| --- | --- | --- |
| Public readiness | repeated `503` from `/health` | correlate router, dyno, and database state; stop accepting new work if storage is unavailable |
| Official queue health | authenticated health is unhealthy or times out | inspect both workflow and step queue results before restarting dynos |
| Release phase | release remains pending or fails | read release output; do not bypass an active-run block with `warn` |
| Dyno lifecycle | crash loop, boot timeout, or repeated forced termination | inspect the last successful release and confirm Graphile remains the sole signal owner |
| Connection usage | sustained growth toward the declared plan limit | rerun the doctor and reduce process, application-pool, or Workflow-pool counts |
| Database size | 80% warning and 90% critical of the plan limit | identify table and index growth, then upgrade capacity because Workflow history cannot be deleted through the stable API |

Heroku Postgres metrics and service logs depend on the database tier. The
Essential-tier database created by the button is suitable for the demo but
does not provide the same logging, rollback, follower, and high-availability
capabilities as production tiers. Verify the current plan contract before
setting an availability or recovery objective.

Useful read-only diagnostics include:

```bash
heroku pg:info --app "$HEROKU_APP_NAME"
heroku pg:diagnose DATABASE --app "$HEROKU_APP_NAME"
heroku pg:total-table-size DATABASE --app "$HEROKU_APP_NAME"
heroku pg:table-indexes-size DATABASE --app "$HEROKU_APP_NAME"
```

`pg:diagnose` can add load and its output can contain operational metadata.
Review it before sharing. Track the Workflow tables and Graphile Worker schema
separately from application tables so growth has an owner and forecast.

## Retention and recovery

The stable World interface models an append-only event log and has no general
run-deletion method. This adapter therefore has no retention command. Directly
deleting `workflow_runs`, `workflow_events`, `workflow_steps`,
`workflow_hooks`, `workflow_stream_chunks`, or Graphile Worker rows can break
materialized state, correlation, replay, hooks, streams, or scheduled work and
is unsupported.

Define the following before production traffic:

1. a database-size budget and forecast based on representative workflow
   histories, events, steps, streams, and indexes;
2. warning and critical alerts before the plan's storage limit;
3. an upgrade path when retained history approaches that limit;
4. a logical-backup schedule and restore exercise for data portability;
5. a plan-supported rollback or disaster-recovery objective; and
6. an explicit decision about how long application-level audit exports must be
   retained outside Workflow storage.

Heroku continuously protects managed Postgres databases, but recovery features
vary by tier. Essential-tier databases do not provide rollback, fork, or
follower recovery. Logical backups are a complementary portability mechanism,
not a substitute for testing the selected plan's recovery behavior.

Do not rotate `WORKFLOW_HEROKU_ENCRYPTION_KEY` or
`WORKFLOW_HEROKU_ENCRYPTION_CONTEXT` while encrypted history remains. There is
no multi-key decrypt or online re-encryption path in this release.

## Deployment and incident sequence

For a routine code release:

1. run the full repository release test on the exact candidate;
2. keep breaking workflow definitions under new versioned exported names;
3. let the blocking release check prove there are no non-terminal runs;
4. deploy and inspect the release output;
5. verify both health endpoints and start a non-destructive smoke workflow;
6. confirm the run reaches a terminal state and review logs; and
7. retain the prior release and database recovery path until the observation
   window closes.

During an incident, preserve evidence before changing code or database state.
Capture the current release, dyno formation, health output, doctor output,
relevant logs, and `pg:info`. Prefer retrying idempotent work or restoring
service availability over editing Workflow tables. A rollback is safe only if
the database schema and workflow definitions remain compatible with the old
slug.

## Primary platform references

- [Heroku Release Phase](https://devcenter.heroku.com/articles/release-phase)
- [Heroku logging](https://devcenter.heroku.com/articles/logging)
- [Heroku log drains](https://devcenter.heroku.com/articles/log-drains)
- [Monitoring Heroku Postgres](https://devcenter.heroku.com/articles/monitoring-heroku-postgres)
- [Heroku Postgres performance analytics](https://devcenter.heroku.com/articles/heroku-postgres-performance-analytics)
- [Managing Heroku Postgres with the CLI](https://devcenter.heroku.com/articles/managing-heroku-postgres-using-cli)
- [Heroku Postgres data safety](https://devcenter.heroku.com/articles/heroku-postgres-data-safety-and-continuous-protection)
- [Heroku Postgres logical backups](https://devcenter.heroku.com/articles/heroku-postgres-logical-backups)
