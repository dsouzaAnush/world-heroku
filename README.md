<h1 align="center">Workflow World for Heroku</h1>

<p align="center">
  Run durable Workflow DevKit applications on Heroku with Heroku Postgres.
</p>

<p align="center">
  <a href="https://workflow-sdk.dev/worlds">Workflow Worlds</a>
  ·
  <a href="./docs/architecture.md">Architecture</a>
  ·
  <a href="./docs/publishing.md">Release guide</a>
</p>

[![CI](https://github.com/dsouzaAnush/world-heroku/actions/workflows/ci.yml/badge.svg)](https://github.com/dsouzaAnush/world-heroku/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@anushdsouza/world-heroku.svg)](https://www.npmjs.com/package/@anushdsouza/world-heroku)
[![Apache-2.0 license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://www.heroku.com/deploy?template=https://github.com/dsouzaAnush/world-heroku)

`@anushdsouza/world-heroku` is a personal, unofficial community
[World](https://workflow-sdk.dev/worlds) adapter for the
[Workflow DevKit](https://workflow-sdk.dev) on Heroku. It uses Heroku Postgres
for workflow history, steps, hooks, streams, durable jobs, retries, and timers.

The adapter composes the official
[`@workflow/world-postgres`](https://github.com/vercel/workflow/tree/main/packages/world-postgres)
implementation and adds the provider boundary that Heroku applications need:

- zero-argument configuration from Heroku's `DATABASE_URL` config var;
- Heroku-specific concurrency, pool, and queue-prefix config vars;
- fail-fast production configuration instead of a silent localhost fallback;
- per-run AES-256-GCM payload encryption using the same HKDF-SHA256 key
  derivation contract as the official Vercel World;
- a database bootstrap command, production doctor, and active-run release
  guard designed for Heroku's release phase;
- helpers for constant-time bearer authentication and loopback-only Workflow
  execution routes; and
- Heroku-specific deployment and capacity guidance.

> [!IMPORTANT]
> This is a personal, experimental community project maintained by Anush
> D'Souza. It is not affiliated with, endorsed by, or supported by Heroku,
> Salesforce, or Vercel, and it is not a managed durable-execution service.
> “Heroku” is used only to describe platform compatibility. The current
> implementation inherits the Postgres World's embedded worker model and its
> limitations.

## Install

```bash
npm install workflow @anushdsouza/world-heroku
```

The tested Workflow 4 line currently pins transitive versions that have newer
security fixes. npm applies `overrides` only from the consuming application's
root manifest, so add the same resolutions used by this repository and the
deployable example:

```json
{
  "overrides": {
    "@hono/node-server": "1.19.15",
    "hono": "4.12.34",
    "nanoid": "5.1.16",
    "undici": "7.29.0"
  }
}
```

Commit the resulting lockfile and run `npm audit --omit=dev --audit-level=high`.
Remove an override only after upgrading to a tested Workflow release that no
longer resolves the affected version.

The package uses its maintainer's npm scope, following the Workflow ecosystem
convention for independently published community Worlds. The `@workflow/*`
namespace is reserved for packages published by the Workflow project.

## Deploy on Heroku

### Try the deployable demo

The button provisions a runnable demo with one Basic web dyno and an
Essential-0 Heroku Postgres database, builds the Workflow DevKit routes,
bootstraps the schema in Heroku's release phase, and opens a page where you can
start and observe a durable two-step workflow:

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://www.heroku.com/deploy?template=https://github.com/dsouzaAnush/world-heroku)

> [!WARNING]
> The template creates paid Heroku resources: one `basic` dyno and one
> `heroku-postgresql:essential-0` database. Review
> [Heroku's current usage and billing documentation](https://devcenter.heroku.com/articles/usage-and-billing)
> before deploying, and delete the app when you finish testing if you do not
> want it to keep accruing usage.

The deployable application is intentionally isolated in
[`examples/heroku-button`](./examples/heroku-button). It installs the World
from the same repository revision so a button deployment tests the code that
was reviewed, while the demo itself remains excluded from the npm tarball.

### Configure your own application

Attach Heroku Postgres to your application, then select the World:

```bash
heroku config:set \
  WORKFLOW_TARGET_WORLD="@anushdsouza/world-heroku" \
  --app your-app
```

Heroku Postgres supplies `DATABASE_URL` automatically. Bootstrap the Workflow
schema before starting application dynos by adding this command to the
application's release phase:

```text
release: npx --no-install workflow-heroku-bootstrap && npx --no-install workflow-heroku-doctor --strict && npx --no-install workflow-heroku-release-check
web: npm start
```

The bootstrap is idempotent. A failed release command prevents the new release
from replacing the currently running release. The release guard defaults to
`block`: Heroku has no Postgres World deployment-affinity router, so a new slug
must not replace the code needed by pending or running workflows. The demo's
repository-level `Procfile` uses `--policy=warn` so a personal demo cannot lock
its owner out of future deployments; use the blocking default for production.

### Start the embedded worker

The Postgres-backed World has a background Graphile Worker. Applications must
call `world.start()` once during server initialization.

For Next.js, add a root `instrumentation.ts`:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { getWorld } = await import('workflow/runtime');
    const world = await getWorld();
    await world.start?.();
  }
}
```

Configure Workflow DevKit in `next.config.ts` as usual:

```typescript
import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const nextConfig: NextConfig = {};

export default withWorkflow(nextConfig);
```

For other long-lived Node.js frameworks, call the same `getWorld()` and
`start()` sequence from the framework's server-startup hook. The web process
must expose Workflow DevKit's generated HTTP routes and listen on Heroku's
`PORT`.

The stable Postgres World installs Graphile Worker's signal handling. Do not
register a competing `SIGTERM` handler unless the World version supports
application-managed shutdown. The Nitro example uses Nitro's documented
`node_middleware` preset and a Node HTTP server, leaving Graphile Worker as the
single signal owner. On Heroku, the router removes the dyno from service while
the loopback server remains available for in-flight workflow deliveries;
Graphile stops claiming work, drains active jobs, and exits the process.

Frameworks with an application-managed shutdown path may await `world.close()`
only when the installed Postgres World version explicitly supports that mode.
Keep workflow steps idempotent because Heroku can still terminate a dyno after
its shutdown window.

### Protect execution and application routes

The stable Postgres World executes queue messages by posting to
`/.well-known/workflow/v1/*` on the same process. Those protocol handlers do
not authenticate arbitrary public HTTP requests. A Heroku application must
reject non-loopback requests to that path family while allowing the embedded
worker's kernel-reported `127.0.0.1` or `::1` connection. Never trust
`X-Forwarded-For` for this decision.

The deployable Nitro example implements this boundary in
[`server/middleware/security.ts`](./examples/heroku-button/server/middleware/security.ts)
and requires a constant-time bearer token for its application APIs. The
package exports `isWorkflowProtocolPath()`, `isLoopbackAddress()`, and
`isAuthorizedBearerToken()` so other long-lived Node frameworks can apply the
same checks at their server boundary. If a framework does not expose the
kernel peer address, place an authenticated local proxy in front of the
generated routes or do not use this embedded-worker topology.

On Heroku, the example also refuses its operator page and `/api/*` requests
unless the router reports HTTPS through `X-Forwarded-Proto`, and emits HSTS on
HTTPS responses. Heroku does not automatically redirect HTTP to HTTPS. This
proxy header is used only for transport enforcement; it is never accepted as
proof that a request came from the embedded worker.

## Configuration

`createWorld()` accepts the same programmatic configuration as the official
Postgres World. With no arguments, it resolves these config vars in order:

| Concern | Preferred variable | Compatible fallback | Default |
| --- | --- | --- | --- |
| PostgreSQL URL | `WORKFLOW_HEROKU_POSTGRES_URL` | `WORKFLOW_POSTGRES_URL`, then `DATABASE_URL` | Required |
| Worker concurrency per process | `WORKFLOW_HEROKU_WORKER_CONCURRENCY` | `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` | `10` |
| Internal pool size per process | `WORKFLOW_HEROKU_MAX_POOL_SIZE` | `WORKFLOW_POSTGRES_MAX_POOL_SIZE` | `10` |
| Graphile job prefix | `WORKFLOW_HEROKU_JOB_PREFIX` | `WORKFLOW_POSTGRES_JOB_PREFIX` | Unset |
| Queue namespace | `WORKFLOW_QUEUE_NAMESPACE` | None | Upstream default |
| Encryption master key | `WORKFLOW_HEROKU_ENCRYPTION_KEY` | None | Unset |
| Encryption context | `WORKFLOW_HEROKU_ENCRYPTION_CONTEXT` | None | Unset |

All numeric values must be positive integers. Heroku-specific variables win
when both forms are set. The encryption key and context must be configured
together. The key must decode to exactly 32 bytes from 64-character hex,
44-character padded base64, or 43-character base64url. Never rotate or remove
either value while encrypted runs remain: old runs require the same material
to decrypt their persisted event data.

The operator commands additionally understand:

| Variable | Purpose |
| --- | --- |
| `WORKFLOW_HEROKU_DATABASE_CONNECTION_LIMIT` | Total limit of the attached Postgres plan |
| `WORKFLOW_HEROKU_PROCESS_COUNT` | Processes that each instantiate this World |
| `WORKFLOW_HEROKU_APPLICATION_POOL_SIZE` | Other DB pool connections per process |
| `WORKFLOW_HEROKU_API_TOKEN` | Demo application bearer token |
| `WORKFLOW_HEROKU_RELEASE_POLICY` | `block` (default) or `warn` |

Programmatic usage is also supported:

```typescript
import { createWorld } from '@anushdsouza/world-heroku';

const world = createWorld({
  connectionString: process.env.DATABASE_URL!,
  jobPrefix: 'billing',
  maxPoolSize: 10,
  namespace: 'billing',
  queueConcurrency: 8,
  encryptionKey: process.env.WORKFLOW_HEROKU_ENCRYPTION_KEY!,
  encryptionContext: 'billing-production',
});

await world.start();
```

The package also re-exports the Postgres schema:

```typescript
import { events, hooks, runs, steps, streams } from '@anushdsouza/world-heroku';
// or: import * as schema from '@anushdsouza/world-heroku/schema';
```

## Architecture

```text
Heroku web dyno
├── application server
├── loopback-only /.well-known/workflow/v1/* execution routes
└── embedded Graphile Worker
          │
          ▼
Heroku Postgres
├── workflow run, event, step, hook, and stream tables
└── durable Graphile jobs, retries, and scheduled wake-ups
```

Each queue worker sends workflow and step execution back to the HTTP server in
its own process through loopback. Multiple web processes can share one queue
and database, but each adds a pool, a streaming LISTEN connection, and worker
concurrency. This repository does not present a separate Heroku `worker`
process because the stable upstream adapter has no authenticated remote
dispatch contract from a worker dyno back to a web dyno.

Workflow history and queued work survive dyno replacement because they live in
Postgres. External side effects can still be delivered at least once; steps
that charge a card, send a message, or mutate another system must use domain
idempotency keys.

Postgres World cannot route an existing run back to the old Heroku slug whose
code created it. The release command therefore blocks while any run is pending
or running. Keep the blocking policy for production, and introduce breaking
workflow changes under a new exported workflow name such as `orderFlowV2`.
Only remove the old definition after all runs using it are terminal. A
versioned name prevents old and new queue topics from colliding, while the
release guard prevents deterministic replay from crossing code versions.

Read [the architecture notes](./docs/architecture.md) before changing dyno
formation, connection limits, or worker concurrency.

Read the [production operations runbook](./docs/operations.md) before choosing
a database tier, alert thresholds, log retention, backup/restore posture, or
incident procedure. The button provisions a demo formation, not a production
sizing or availability recommendation.

## Operational checklist

Before using this adapter for a production workload:

1. Run `workflow-heroku-bootstrap`, `workflow-heroku-doctor --strict`, and the
   blocking `workflow-heroku-release-check` in the release phase.
   `WORKFLOW_HEROKU_RELEASE_POLICY=warn` is diagnostic-only and is unsafe for a
   production code release.
2. Configure payload encryption and preserve its key and context for the full
   lifetime of every encrypted run.
3. Confirm server startup calls `world.start()` exactly once per process and
   one component owns process signals. For the stable embedded topology, let
   Graphile Worker drain and exit; use `world.close()` only with an upstream
   application-managed shutdown mode.
4. Reject public requests to Workflow execution routes and authenticate,
   authorize, validate, and rate-limit application APIs.
5. Declare the process count and database connection limit, then make the
   doctor pass before scaling the formation.
6. Keep worker concurrency within application and downstream-system capacity.
7. Make every external side effect idempotent and safe to retry.
8. Define retention, backup/restore, tenant isolation, quotas, monitoring, and
   audit export at the application and database layers.
9. Run the repository's restart, database-outage, delayed-retry, hook-resume,
   release-guard, encryption, and graceful-shutdown tests against the intended
   formation, followed by a live Heroku lifecycle exercise.

## Known limits

- This is a provider adapter over Postgres World, not a new execution engine.
- The embedded worker is coupled to the web process and its loopback execution
  routes.
- Horizontal web scaling multiplies worker concurrency and database pools.
- General workflow-history retention and a supported deletion API are not
  implemented upstream. Do not delete event rows with ad hoc SQL.
- Encryption has no online key-rotation or multi-key decrypt mechanism.
- Workflow 4's exact transitive pins currently require the documented
  consumer-root security overrides; review them on every dependency upgrade.
- Authentication helpers do not provide user identity, tenant isolation,
  authorization policy, quotas, or rate limiting.
- Postgres World does not provide Vercel's deployment-affinity semantics.
- Heroku's 30-second graceful-shutdown window still requires idempotent,
  retry-safe handlers.

## Development and verification

Requirements: Node.js 22 or newer and npm 11.

```bash
npm install
npm run check
npm run test:package-consumer
npm run test:integration
npm run test:heroku-button
npm run release:safety
```

`npm run check` validates formatting and lint rules, TypeScript declarations,
unit tests, public exports, the exact npm tarball, known dependency
vulnerabilities, and public-source safety. `npm run test:integration` builds
the package, starts isolated PostgreSQL when `TEST_DATABASE_URL` is absent,
verifies idempotent bootstrap and the production doctor/release CLIs, and runs
the official Workflow World conformance suite.

`npm run test:package-consumer` packs the candidate into a temporary tarball,
installs it with the documented root security overrides in an empty project,
checks the package root and schema exports, verifies all three executable
operator commands, and requires a zero-high-severity production audit.

`npm run test:heroku-button` performs a clean install and production build of
the deployable sample, then verifies authenticated HTTP execution, rejection of
unauthenticated APIs and non-worker protocol requests, official workflow/step
health, ciphertext at rest in raw Postgres rows, durable retries, hook resume,
the official cookbook's fan-out, batching, and saga-compensation patterns,
active-run release blocking, an unsafe connection-budget rejection, two
processes sharing one database, completion after abrupt process loss,
database pause/recovery, and graceful shutdown. CI runs the real-database
gates on Node.js 22, 24, and 26.

These tests provide strong local runtime evidence; they do not substitute for
the final disposable-app Heroku deploy, public-route rejection, restart,
release, and teardown exercise recorded in
[docs/release-readiness.md](./docs/release-readiness.md).

## Release and Workflow community listing

Releases are published from an exact `vX.Y.Z` tag on `main` after the full test
gate has passed. The npm package and source repository must both be public
before this World can be submitted to Workflow's ecosystem manifest.

The complete sequence—including the one-time npm bootstrap, trusted
publishing, repository protection, release verification, and the upstream
`worlds-manifest.json` pull request—is in
[docs/publishing.md](./docs/publishing.md). The proposed manifest object is
[docs/worlds-manifest-entry.json](./docs/worlds-manifest-entry.json).

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow. The
latest evidence and outstanding publication gates are in
[docs/release-readiness.md](./docs/release-readiness.md).

## License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
