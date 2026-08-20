# Security policy

## Supported versions

Before the first stable release, only the latest published `0.x` version is
eligible for security fixes.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** flow for this repository so the report
and follow-up remain private. Do not include credentials, production database
URLs, customer payloads, or other secrets in a public issue.

Include:

- the affected package version and Node.js version;
- the relevant Workflow DevKit and Postgres World versions;
- the Heroku topology involved, without customer identifiers;
- reproduction steps or a minimal proof of concept;
- the security impact; and
- any known mitigations.

If private vulnerability reporting is not enabled at the canonical repository,
contact the repository owners through the security channel published by that
repository before sharing technical details.

## Scope boundary

This package configures and delegates to `@workflow/world-postgres`. Reports
that reproduce without this adapter may belong in the
[`vercel/workflow`](https://github.com/vercel/workflow/security) project, but
please report uncertain cases privately here first so maintainers can
coordinate disclosure.

## Deployment security requirements

This package is not an authentication or tenant-isolation layer. Applications
using it are responsible for all of the following:

- reject non-loopback traffic to `/.well-known/workflow/*`; the stable embedded
  Postgres worker calls these execution handlers over same-process loopback and
  the handlers are not a public API;
- never trust `Forwarded` or `X-Forwarded-For` to prove loopback origin;
- require HTTPS for every route that receives an operator token or workflow
  payload; Heroku terminates TLS at the router and does not redirect HTTP
  automatically;
- authenticate, authorize, validate, rate-limit, and audit application routes
  that start, inspect, cancel, or resume workflows;
- keep `DATABASE_URL`, `WORKFLOW_HEROKU_ENCRYPTION_KEY`, and application tokens
  in Heroku config vars or an equivalent secret manager, never source control;
- use a stable 32-byte encryption key and context for as long as encrypted runs
  may need to resume or be inspected;
- use domain idempotency keys for every externally visible side effect; and
- constrain database connections and aggregate worker concurrency across every
  process in the formation.

The deployable example implements a single-operator bearer-token boundary. It
is not a multi-user identity, authorization, or quota system.

## Threat model summary

Protected assets include workflow payloads and history, database credentials,
the encryption master key, authority to execute registered steps, service
availability, and release integrity. The principal trust boundaries are remote
HTTP traffic into the application, embedded queue dispatch over loopback,
application access to Postgres, operator-controlled config vars, and GitHub
Actions publishing to npm.

The security design assumes Heroku config is controlled by trusted operators,
public router connections have a non-loopback kernel peer address, and the
pinned upstream World satisfies its documented storage and queue contract. A
compromised database credential, encryption key, bearer token, maintainer
account, or upstream dependency is outside the protection of the corresponding
control and requires credential rotation or incident response.
