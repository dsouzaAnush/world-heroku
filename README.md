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
- a database bootstrap command designed for Heroku's release phase; and
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
[`examples/heroku-button`](./examples/heroku-button). It installs the published
`@anushdsouza/world-heroku` package from npm; the root repository remains the
World library, and the demo is excluded from the npm package tarball.

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
release: npx --no-install workflow-heroku-bootstrap
web: npm start
```

The bootstrap is idempotent. A failed release command prevents the new release
from replacing the currently running release.

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

## Configuration

`createWorld()` accepts the same programmatic configuration as the official
Postgres World. With no arguments, it resolves these config vars in order:

| Concern | Preferred variable | Compatible fallback | Default |
| --- | --- | --- | --- |
| PostgreSQL URL | `WORKFLOW_HEROKU_POSTGRES_URL` | `WORKFLOW_POSTGRES_URL`, then `DATABASE_URL` | Required |
| Worker concurrency per process | `WORKFLOW_HEROKU_WORKER_CONCURRENCY` | `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` | `10` |
| Internal pool size per process | `WORKFLOW_HEROKU_MAX_POOL_SIZE` | `WORKFLOW_POSTGRES_MAX_POOL_SIZE` | `10` |
| Graphile job prefix | `WORKFLOW_HEROKU_JOB_PREFIX` | `WORKFLOW_POSTGRES_JOB_PREFIX` | Unset |

All numeric values must be positive integers. Heroku-specific variables win
when both forms are set.

Programmatic usage is also supported:

```typescript
import { createWorld } from '@anushdsouza/world-heroku';

const world = createWorld({
  connectionString: process.env.DATABASE_URL!,
  jobPrefix: 'billing',
  maxPoolSize: 10,
  queueConcurrency: 8,
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
├── /.well-known/workflow/v1/* execution routes
└── embedded Graphile Worker
          │
          ▼
Heroku Postgres
├── workflow run, event, step, hook, and stream tables
└── durable Graphile jobs, retries, and scheduled wake-ups
```

The queue worker sends workflow and step execution back to the HTTP server on
the same dyno through loopback. This is why the first release uses one
long-lived web process rather than presenting a separate Heroku `worker`
process as if it were already supported by the upstream adapter.

Workflow history and queued work survive dyno replacement because they live in
Postgres. External side effects can still be delivered at least once; steps
that charge a card, send a message, or mutate another system must use domain
idempotency keys.

Read [the architecture notes](./docs/architecture.md) before changing dyno
formation, connection limits, or worker concurrency.

## Operational checklist

Before using this adapter for a production workload:

1. Run `workflow-heroku-bootstrap` in the release phase.
2. Confirm server startup calls `world.start()` exactly once per process.
3. Keep `maxPoolSize` within the database plan's total connection budget after
   multiplying it by every web process.
4. Keep worker concurrency within both application and downstream-system
   capacity.
5. Make every external side effect idempotent and safe to retry.
6. Define run-history retention and cleanup outside this package.
7. Add payload encryption, access control, tenant isolation, quotas, and audit
   export appropriate to the application.
8. Test deploy, restart, database-unavailable, delayed-retry, and hook-resume
   recovery paths against the intended Heroku formation.

## Known limits

- This is a provider adapter over Postgres World, not a new execution engine.
- The embedded worker is coupled to the web process and its loopback execution
  routes.
- Horizontal web scaling multiplies worker concurrency and database pools.
- General workflow-history retention and cleanup are not implemented upstream.
- Application payload encryption and tenant isolation are not added here.
- Postgres World does not provide Vercel's deployment-affinity semantics.
- Heroku's 30-second graceful-shutdown window still requires idempotent,
  retry-safe handlers.

## Development and verification

Requirements: Node.js 22 or newer and npm 11.

```bash
npm install
npm run check
npm run test:integration
npm run test:heroku-button
npm run release:safety
```

`npm run check` validates formatting and lint rules, TypeScript declarations,
unit tests, public package exports, the exact npm tarball contents, and known
dependency vulnerabilities. `npm run test:integration` builds the package,
starts an isolated PostgreSQL 18 container when `TEST_DATABASE_URL` is not
already set, verifies that schema bootstrap is idempotent, and runs both the
adapter smoke test and the official Workflow World conformance suite. CI runs
that same real-database gate on Node.js 22, 24, and 26. `npm run
test:heroku-button` performs a clean install of the deployable sample, builds
its transformed Workflow routes, boots the published npm package against a real
Postgres database, starts the production server, triggers the sample over HTTP,
and waits for its durable two-step run to complete. `npm run
release:safety` scans the complete public source candidate for credential
patterns, private filesystem paths, unsafe environment files, private keys,
and oversized or unexpected release artifacts.

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
