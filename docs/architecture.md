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
dedicated stream listeners        = n × 1
maximum active worker jobs       = n × WORKFLOW_HEROKU_WORKER_CONCURRENCY
```

Postgres World shares its configured pool between storage and Graphile Worker,
while its streamer opens one additional dedicated PostgreSQL client per
process. The real database budget must also include application pools, one-off
dynos, release-phase work, administrative connections, and platform headroom:

```text
required = processes × (workflow pool + application pool + 1 listener)
           + one-off allowance + operational headroom
```

`calculateHerokuCapacity()` exposes this calculation and
`workflow-heroku-doctor --strict` fails a declared unsafe formation. Do not
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
  connection use and aggregate concurrency. Every embedded worker dispatches a
  claimed job to its own process over loopback.
- **Rolling code deployment:** Postgres World reports one shared deployment ID
  and cannot route an old run back to the slug that created it. Production
  releases must drain or explicitly cancel/rerun active work before replacing
  code.

Breaking workflow changes must also use a new exported workflow name (for
example, `orderFlowV1` to `orderFlowV2`) and keep the old implementation until
its runs are terminal. Versioned names isolate queue topics, but they do not
replace the blocking release guard: deterministic replay can still cross a
slug boundary when any non-terminal run remains.

## Security boundary

The generated Workflow protocol handlers accept the queue metadata and
serialized message format expected by the stable Postgres World; they are not a
public application API. Heroku router traffic must be rejected for the entire
`/.well-known/workflow/` path family, while kernel-reported loopback traffic is
allowed. Forwarded headers are attacker-controlled and cannot establish this
boundary.

Application APIs need their own authentication, authorization, request limits,
and tenant model. The deployable example demonstrates a single operator bearer
token only; it is not a multi-user identity system.

When encryption is configured, the adapter derives a unique 256-bit key for
each run with HKDF-SHA256 using the stable application context and run ID. The
Workflow runtime performs authenticated encryption of persisted serialized
data. Key material is never logged by adapter commands. There is no key ring or
online re-encryption path, so key rotation requires all runs encrypted with the
old material to be terminal and outside the application's retention boundary.

## Release and shutdown lifecycle

The release phase has three ordered gates:

1. idempotently bootstrap the Workflow and Graphile Worker schemas;
2. validate database access, encryption, queue isolation, API-token presence,
   production mode, and the declared connection budget; and
3. reject a production release while pending or running workflows still rely
   on the current slug.

The `block` policy is the production contract and the Deploy to Heroku example
uses it. The optional `warn` policy exists only for diagnostics; it must not be
used to roll out application code while non-terminal runs remain.

The stable Postgres World owns Graphile Worker's signal integration. The Nitro
sample therefore uses Nitro's documented `node_middleware` preset with a Node
HTTP server and does not install a competing process-signal handler. Heroku
stops routing new public traffic, Graphile stops claiming jobs, the loopback
server remains available while active deliveries finish, and Graphile exits
the process after its queue drains. Tests require that path to exit inside a
ten-second drain window without `SIGKILL`.

Do not combine two independent `SIGTERM` owners. A framework may coordinate
and await `world.close()` only with a Postgres World release that explicitly
supports application-managed shutdown. Steps must remain idempotent because
Heroku can still interrupt an in-flight process.

## Retention and recovery

The stable World contract has no general run-deletion API. This adapter does
not bypass the event-sourcing invariants with provider-specific `DELETE`
statements. Production operators must size Postgres for the chosen history
window, monitor table and index growth, enable the backup/restore posture
appropriate to the plan, and treat supported upstream retention as a future
compatibility feature. Ad hoc deletion of run, event, step, hook, stream, or
Graphile Worker rows is unsupported.

## Compatibility policy

The adapter pins `@workflow/world-postgres` to an exact version because the
World interface and storage behavior evolve independently of the top-level
`workflow` package. A dependency upgrade requires:

1. waiting for the configured seven-day minimum release age instead of
   bypassing the supply-chain hold for a newly published dist-tag;
2. reviewing upstream changelogs and bundled documentation;
3. running this repository's unit and package checks;
4. exercising the upstream World conformance suite against a real Postgres
   service; and
5. completing Heroku restart, deploy, retry, hook, and connection-budget tests.

Workflow DevKit 5 requires a separate compatibility release; it is not
silently admitted by the current peer dependency range.

## Not implemented

This repository does not currently add:

- a managed Heroku control plane or Workflow dashboard;
- dedicated worker dynos or queue-aware autoscaling;
- deployment affinity for in-flight workflow versions;
- online encryption-key rotation or an external key-management integration;
- general run-history retention and deletion;
- cross-region disaster recovery;
- tenant isolation, quotas, billing, or audit export; or
- a Heroku add-on provisioning contract.
