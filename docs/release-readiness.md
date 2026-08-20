# Release readiness

## Verdict

**Version `0.2.0` release candidate; local production-hardening and hosted CI
gates pass, while live Heroku verification is still required before release.**

Version `0.1.0` remains public as the personal
[`@anushdsouza/world-heroku`](https://www.npmjs.com/package/@anushdsouza/world-heroku)
npm package and
[`dsouzaAnush/world-heroku`](https://github.com/dsouzaAnush/world-heroku).
The current branch hardens that release with encrypted payloads,
loopback-only execution routes in the deployable example, production
diagnostics, connection-budget enforcement, active-run deploy blocking, and
real restart/outage/retry/hook/shutdown tests. It must not be published until
the remaining gates below pass on the exact squashed candidate.

The immutable [`v0.1.0`](https://github.com/dsouzaAnush/world-heroku/releases/tag/v0.1.0)
tag resolves to the single public-safe root commit
`e14298514df381c28baac3dcb70f72eca46e228f`. Later `main` commits are public
release-automation maintenance and SHA-pinned GitHub Action upgrades; they do
not import private prototype or review history.

The released `0.1.0` evidence below remains historical. The `0.2.0` candidate
was verified locally on 2026-08-20 with Node.js 26.5.0, npm 11.17.0, Colima,
Docker 29.2.1, and PostgreSQL 17 Alpine. PostgreSQL 17 was used because the
local container VM could not pull an additional PostgreSQL 18 image without
destructive pruning; the public CI contract still tests PostgreSQL 18.

## Reference snapshots

| Reference | Revision | Used for |
| --- | --- | --- |
| `vercel/workflow` | `9454d51db0d52d6be9bafea9c70ab6fc3a1ceba4` | Stable and next-version World interfaces, official Postgres/Vercel encryption and lifecycle patterns, package shape, conformance suite, and docs |
| `vercel/workflow-examples` | `96a2b536ef50648b535611989d1dd6f148708506` | Packaged Next.js/Postgres consumer test |
| `mizzle-dev/workflow-worlds` | `d48f8d019fe08ee9c675019160ec0e008eb83cd6` | Community World package naming and metadata |
| `platformatic/platformatic-world` | `315594147bb8c209cd505f8286910647c7cbe26f` | Deployment-aware drain and lifecycle reference; no control-plane code copied |

The tested dependency line is `workflow@4.8.2`,
`@workflow/world-postgres@4.3.3`, and
`@workflow/world-testing@4.1.17`. The exact Postgres World pin makes this tested
compatibility boundary explicit. On 2026-08-20, npm reported newer stable
patches (`workflow@4.8.4`, `@workflow/world-postgres@4.3.4`, and
`@workflow/world-testing@4.1.19`), but they had been published less than 24
hours earlier and were still inside the maintainer's seven-day minimum release
age. This candidate does not bypass that supply-chain hold merely to track a
new dist-tag. Upgrade the pins only after the hold expires, review the official
diff, and repeat every compatibility gate below.

## Verification evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| Formatting and lint | `biome check .` | Pass |
| Type safety | `tsc --noEmit` with strict NodeNext configuration | Pass |
| Unit behavior | Configuration, encryption, capacity, release pagination, deployment policy, security helpers, and public-source scanner | Pass, 37/37 |
| Build and declarations | ESM JavaScript, declarations, maps, and three executable CLIs | Pass |
| Public exports | Self-import of package root and `/schema` | Pass |
| Tarball | 27-file allowlist; 38.2 kB packed / 111.1 kB unpacked; architecture and operations docs included; examples and internal evidence excluded | Pass |
| Packed consumer | Empty project installs the tarball with documented root overrides; root/schema imports and three executable bins verified | Pass |
| Dependency security | Repository and packed production consumer `npm audit` | Pass, 0 vulnerabilities with documented Workflow 4 transitive overrides |
| PostgreSQL bootstrap | Fresh PostgreSQL 17 database; bootstrap executed twice | Pass, idempotent |
| Official World conformance | Basic execution, idempotency, hooks and streaming, null-byte serialization, retry and fatal-error behavior | Pass, 5/5 |
| Adapter lifecycle and release CLI | Start/storage/close plus release block with active run and pass after drain | Pass |
| Example transport, auth, and health | Heroku HTTP operator/API request, unauthorized API request, and non-worker protocol request rejected; HSTS, storage, and official workflow/step health verified | Pass |
| Encryption at rest | Raw run/event/step rows do not contain submitted plaintext | Pass |
| Cookbook fan-out | Three notification steps execute with `Promise.all` | Pass, 3 delivered / 0 failed |
| Cookbook batching | Five items execute in batches of two | Pass, 5 completed / 0 failed |
| Cookbook saga | Intentional fatal provisioning failure compensates successful work in reverse order | Pass, `billing` then `account` rolled back |
| Durable retry | `RetryableError` delay followed by successful completion | Pass |
| Hook and release drain | Hook suspends, blocking release fails, resume completes, drained release passes | Pass |
| Horizontal process/restart | Two servers share one database; a run survives abrupt loss of its starting process and completes on `web.2` | Pass |
| Database interruption | PostgreSQL pauses; health returns 503; unpause restores health and the waiting run completes | Pass |
| Graceful shutdown | Nitro `node_middleware` server leaves Graphile as sole signal owner and exits inside 10 seconds without forced kill | Pass |
| Connection safety | Doctor accepts the safe formation and rejects an unsafe two-process budget | Pass |
| Deployment-version safety | Deployable `Procfile` and `app.json` use the blocking active-run policy; breaking-name and drain contract documented | Pass |
| Retention and observability | Official health check, doctor/release JSON, Heroku logging/metrics/diagnostic runbook, storage-growth thresholds, and explicit no-unsafe-delete boundary | Pass within the stable World contract; supported run deletion remains unavailable upstream |
| Security review | Standard scan plus complete final-candidate diff scan; authoritative changes and supporting runtime surfaces reviewed | Pass, 0 validated findings; parent-only fallback and TAC status unavailable |
| Workflow community manifest | Candidate inserted into audited upstream snapshot and processed by `create-community-worlds-matrix.mjs` as a community PostgreSQL row | Pass locally; upstream PR still required |
| Hosted GitHub Actions matrix | Node.js 22, 24, and 26 with PostgreSQL 18 on final squashed candidate; [PR checks](https://github.com/dsouzaAnush/world-heroku/pull/6/checks) | Pass, 3/3 jobs |
| Live Heroku lifecycle | Build/release, public protocol-route rejection, encrypted workflow, dyno restart, logs, and teardown | Pending explicit deployment approval |

The current runnable example uses the repository package through a local
package dependency, `WORKFLOW_TARGET_WORLD=@anushdsouza/world-heroku`, generated
`/.well-known/workflow/v1/*` routes, the embedded Graphile Worker, and real
PostgreSQL. It does not import `@workflow/world-postgres` directly.

## Convention audit

| Convention | This World | Assessment |
| --- | --- | --- |
| Package ownership | `@anushdsouza/world-heroku` | Personal scope states ownership; `world-heroku` names the provider in the same order as `world-vercel` and `world-postgres`; `@workflow/*` is first-party and `@heroku/*` would imply provider ownership |
| Repository role | Standalone adapter repository | Appropriate; unlike Vercel's first-party Worlds, it is not part of the Workflow monorepo |
| Runtime entry point | Named `createWorld()` export | Matches the current target-World loader and first-party packages |
| Module format | ESM with explicit export map | Matches official and community Worlds |
| Schema access | Root re-export plus `/schema` subpath | Matches Postgres-backed World conventions |
| Operator commands | Generic `bootstrap` alias plus descriptive `workflow-heroku-bootstrap`, `workflow-heroku-doctor`, and `workflow-heroku-release-check` bins | Retains the ecosystem setup convention while keeping diagnostics and release control collision-free |
| Runtime floor | Node.js 22 or newer | Matches the Workflow ecosystem |
| Backend compatibility | Exact Postgres World pin; Workflow v4 peer range | Correct for a thin provider adapter with an explicit compatibility boundary |
| Test contract | Official `@workflow/world-testing` suite | Matches the first-party Postgres World gate |
| Ecosystem manifest | Community type, PostgreSQL 18 service and health check, setup command | Matches the current manifest schema; no false deployment exemption |
| CI | Node.js 22, 24, and 26 plus PostgreSQL 18 | Appropriate standalone equivalent of the upstream matrix |
| Publication | Personal first-publish bootstrap, then GitHub Release-triggered npm OIDC | Uses personal npm ownership and a public, independently maintained source repository |
| Formatting | Biome, strict TypeScript, package checks | Equal to or stricter than the small reference World packages |

Using npm rather than pnpm/Turborepo is intentional for a single-package
standalone repository. The reference monorepos need workspace orchestration;
this package does not.

## Publication boundaries

- Do not rewrite the existing public `main` lineage. Publish this candidate as
  one reviewed squash commit without pushing intermediate private work.
- The locally bootstrapped `0.1.0` package must not be described as
  provenance-bearing. Future GitHub Actions releases may use npm provenance
  after trusted publishing is verified.
- Future accepted work should be squash-merged to keep `main` linear and
  reviewable.
- A public npm package does not make the project eligible for the Workflow
  Worlds site by itself; the GitHub repository must also be public.
- A manifest merge creates the community listing, but upstream community E2E
  was disabled in the audited snapshot. Do not claim an upstream compatibility
  badge or benchmark until upstream runs and publishes those results.
- Local PostgreSQL conformance does not prove live Heroku deploy, restart,
  graceful-shutdown, rollback, or database-interruption behavior.
- Hosted CI passed on the exact `0.2.0` squash candidate across Node.js 22, 24,
  and 26 with PostgreSQL 18. This does not replace the live Heroku gate.

Until a live Heroku lifecycle exercise is complete, describe the project as an
experimental community adapter over Postgres World, not a production-proven
managed Heroku durable-execution product.
