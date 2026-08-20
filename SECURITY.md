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
