# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-20

### Added

- A tested Deploy to Heroku button and runnable durable-workflow demo.
- Optional per-run payload encryption using the official Vercel World
  HKDF-SHA256 derivation pattern.
- `workflow-heroku-doctor` for storage, configuration, queue isolation, and
  database-capacity validation.
- `workflow-heroku-release-check` for blocking code replacement while pending
  or running workflows still depend on the current slug.
- Constant-time bearer-token and loopback execution-route helpers.
- Heroku-only HTTPS enforcement and HSTS for the deployable operator page and
  authenticated APIs.
- Real-server tests for authentication, ciphertext at rest, retry, hook resume,
  release draining, unsafe connection budgets, two-process restart recovery,
  database interruption, cookbook patterns, and graceful shutdown.
- A clean packed-consumer gate for exports, executable CLIs, and production
  dependency audit behavior.

### Changed

- The Deploy to Heroku example now installs the World from the exact repository
  revision being deployed and enables encryption and API authentication by
  default.
- The one-click release phase now enforces the blocking active-run policy so a
  code release cannot silently replay non-terminal work on a different slug.
- The Nitro example now uses its supported `node_middleware` preset so Graphile
  Worker exclusively coordinates Heroku `SIGTERM` draining.
- Architecture, security, operations, and release guidance now document the
  stable Postgres World's lifecycle and deployment-affinity limits explicitly.

## [0.1.0] - 2026-08-19

### Added

- Initial `@anushdsouza/world-heroku` package.
- Heroku-aware `DATABASE_URL`, pool, concurrency, and job-prefix resolution.
- Release-phase database bootstrap command.
- Postgres World schema exports.
- Unit, Postgres integration, package-export, dependency-audit, tarball, and
  multi-version CI checks.
- Official Workflow World conformance and repeatable PostgreSQL 18 test gate.
- Public-source safety scanning for credentials, private paths, unsafe files,
  and oversized artifacts.
- Community-project README and a first-release/community-listing runbook.
- Architecture, operating-boundary, contribution, security, and publishing
  documentation.

[Unreleased]: https://github.com/dsouzaAnush/world-heroku/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dsouzaAnush/world-heroku/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dsouzaAnush/world-heroku/releases/tag/v0.1.0
