# Release readiness

## Verdict

**Engineering gate passed; personal open-source release candidate in progress.**

The package, configuration resolver, bootstrap command, public exports, real
PostgreSQL behavior, official World conformance suite, packaged consumer path,
and representative cookbook workflows pass. The release identity is the
personal `@anushdsouza/world-heroku` npm package and the public
`dsouzaAnush/world-heroku` GitHub repository. The provider-bearing package and
repository names follow the World ecosystem pattern while the personal scope
makes ownership explicit. This is an unofficial community project, not a
Heroku, Salesforce, Vercel, or Workflow product.

Verified on 2026-08-19 with Node.js 22.23.1, 24.15.0, and 26.5.0; npm 11.17.0;
Docker 29.2.1; and PostgreSQL 18 Alpine. The exact release candidate is rerun
after every metadata or documentation change.

## Reference snapshots

| Reference | Revision | Used for |
| --- | --- | --- |
| `vercel/workflow` | `f6513f1f75ffc3bbc8488fb5e26cce1bc94b8a8e` | World package shape, `createWorld`, bootstrap naming, manifest fields, Postgres service, conformance suite, and cookbook tests |
| `vercel/workflow-examples` | `96a2b536ef50648b535611989d1dd6f148708506` | Packaged Next.js/Postgres consumer test |
| `mizzle-dev/workflow-worlds` | `d48f8d019fe08ee9c675019160ec0e008eb83cd6` | Community World package naming and metadata |

The tested dependency line is `workflow@4.8.2`,
`@workflow/world-postgres@4.3.3`, and
`@workflow/world-testing@4.1.17`. The exact Postgres World pin makes this tested
compatibility boundary explicit.

## Verification evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| Formatting and lint | `biome check .` | Pass |
| Type safety | `tsc --noEmit` with strict NodeNext configuration | Pass |
| Unit behavior | 11 resolver, delegation, and public-release scanner assertions | Pass |
| Build and declarations | ESM JavaScript, declarations, maps, executable bootstrap | Pass |
| Public exports | Self-import of package root and `/schema` | Pass |
| Tarball | 11 intended files, 13.8 kB packed / 35.6 kB unpacked | Pass |
| Dependency security | `npm audit` | Pass, 0 vulnerabilities |
| PostgreSQL bootstrap | Fresh PostgreSQL 18 database; bootstrap executed twice | Pass, idempotent |
| Official World conformance | Basic execution, idempotency, hooks and streaming, null-byte serialization, retry and fatal-error behavior | Pass, 5/5 |
| Adapter lifecycle | Start, storage read, and close against PostgreSQL 18 | Pass, 1/1 |
| Packaged consumer | Installed the generated `.tgz` into Vercel's Next.js Postgres example and built generated Workflow routes | Pass |
| Example runtime | Invoked `/api/signup`; durable run completed with 3/3 completed steps | Pass |
| Cookbook saga | Fatal provisioning failure and reverse compensation | Pass, `{"status":"rolled_back"}` |
| Cookbook fan-out | Three parallel notification steps | Pass, 3 delivered / 0 failed |
| Cookbook batching | Five items in batches of two with durable one-second pauses | Pass, 5 succeeded / 0 failed |
| Local Node.js matrix | Full clean-install release gate on 22.23.1, 24.15.0, and 26.5.0 | Pass, 3/3 |
| Hosted GitHub Actions matrix | Node.js 22, 24, and 26 jobs on the public repository | Required before the release is tagged; record the public run after it completes |

The example and cookbook tests use the packed
`@anushdsouza/world-heroku@0.1.0` tarball,
`WORKFLOW_TARGET_WORLD=@anushdsouza/world-heroku`, generated
`/.well-known/workflow/v1/*` routes, the embedded Graphile Worker, and a real
PostgreSQL 18 container. They do not import `@workflow/world-postgres`
directly.

## Convention audit

| Convention | This World | Assessment |
| --- | --- | --- |
| Package ownership | `@anushdsouza/world-heroku` | Personal scope states ownership; `world-heroku` names the provider in the same order as `world-vercel` and `world-postgres`; `@workflow/*` is first-party and `@heroku/*` would imply provider ownership |
| Repository role | Standalone adapter repository | Appropriate; unlike Vercel's first-party Worlds, it is not part of the Workflow monorepo |
| Runtime entry point | Named `createWorld()` export | Matches the current target-World loader and first-party packages |
| Module format | ESM with explicit export map | Matches official and community Worlds |
| Schema access | Root re-export plus `/schema` subpath | Matches Postgres-backed World conventions |
| Database setup | `bootstrap` and `workflow-heroku-bootstrap` bins | Matches the generic bootstrap convention while retaining a collision-free descriptive command |
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

- The public repository must be created from the single final public-safe root
  commit, not by changing the visibility of a private review repository with
  pull-request refs.
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
- Do not describe hosted CI as passing until the public Node.js 22, 24, and 26
  jobs complete on the exact public release commit.

Until a live Heroku lifecycle exercise is complete, describe the project as an
experimental community adapter over Postgres World, not a production-proven
managed Heroku durable-execution product.
