# Architecture and operating boundary

## Decision

Heroku World is a provider adapter over `@workflow/world-postgres` 4.3.x. It
does not fork Workflow DevKit's World contract or copy the Postgres World
implementation.

The initial supported topology is one or more long-lived Heroku web processes.
Each process contains the application server, Workflow DevKit's generated HTTP
execution routes, and an embedded Graphile Worker. Heroku Postgres stores the
event log, materialized entities, stream chunks, queue jobs, retry schedules,
and wake-up times.

## Why the worker is embedded

Postgres World's queue executes work by sending HTTP requests to the
application's generated `/.well-known/workflow/v1/flow` and
`/.well-known/workflow/v1/step` routes. On Heroku, it resolves `PORT` and uses a
loopback URL on the same dyno.

A dedicated worker process type would need an explicit, authenticated remote
dispatch contract back to web dynos, plus lifecycle, readiness, backpressure,
and deploy-version routing semantics. This repository does not invent that
contract. Until it exists upstream, run the embedded worker with the web
server.

## Primitive mapping

| Workflow concern | Implementation | Durability boundary |
| --- | --- | --- |
| Workflow and step routes | Long-lived Heroku web process | Recreated on deploy or dyno restart |
| Runs, events, steps, and hooks | Heroku Postgres | Durable within the attached database's guarantees |
| Queue and scheduled work | Graphile Worker tables in Postgres | Durable across process replacement |
| Streams | Postgres tables plus LISTEN/NOTIFY | Chunks durable; live notification is process-local infrastructure |
| Schema bootstrap | Heroku release phase | New application release is blocked on failure |
| Runtime configuration | Heroku config vars | Versioned as Heroku releases |

## Capacity model

Both worker concurrency and database pools are **per Node.js process**. For a
formation with `n` web processes:

```text
maximum adapter pool connections = n × WORKFLOW_HEROKU_MAX_POOL_SIZE
maximum active worker jobs       = n × WORKFLOW_HEROKU_WORKER_CONCURRENCY
```

The real database budget must also include application pools, one-off dynos,
release-phase work, administrative connections, and platform headroom. Do not
raise concurrency without evaluating the connection budget and downstream
rate limits.

The package intentionally defaults both values to `10`, matching the stable
Postgres World version it wraps. These are compatibility defaults, not sizing
recommendations.

## Failure semantics

- **Dyno restart while waiting:** workflow history, hooks, and scheduled jobs
  remain in Postgres. Startup re-enqueues active runs.
- **Transient step error:** Workflow DevKit can schedule a durable retry.
- **Abrupt shutdown:** a claimed job can be delivered again. Side effects must
  be idempotent.
- **Database unavailable:** durable state remains in Postgres, but new starts,
  storage reads, and worker progress are unavailable until connectivity
  returns.
- **Migration failure:** the Heroku release phase fails and the currently
  active release remains active.
- **Horizontal scaling:** more processes can claim work, but they also multiply
  connection use and aggregate concurrency.

## Compatibility policy

The adapter pins `@workflow/world-postgres` to an exact version because the
World interface and storage behavior evolve independently of the top-level
`workflow` package. A dependency upgrade requires:

1. reviewing upstream changelogs and bundled documentation;
2. running this repository's unit and package checks;
3. exercising the upstream World conformance suite against a real Postgres
   service; and
4. completing Heroku restart, deploy, retry, hook, and connection-budget tests.

Workflow DevKit 5 requires a separate compatibility release; it is not
silently admitted by the current peer dependency range.

## Not implemented

This repository does not currently add:

- a managed Heroku control plane or Workflow dashboard;
- dedicated worker dynos or queue-aware autoscaling;
- deployment affinity for in-flight workflow versions;
- payload encryption or customer-managed keys;
- general run-history retention and deletion;
- cross-region disaster recovery;
- tenant isolation, quotas, billing, or audit export; or
- a Heroku add-on provisioning contract.
