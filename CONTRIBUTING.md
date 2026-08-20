# Contributing

Thank you for helping improve Heroku World.

## Development setup

Use Node.js 22 or newer and npm 11:

```bash
npm install
npm run check
npm run test:integration
npm run release:safety
```

The integration command requires Docker, or a disposable PostgreSQL database
provided through `TEST_DATABASE_URL`. It bootstraps the schema and executes the
official Workflow World conformance suite against this package.

Use `npm run format` to apply the repository's Biome formatting and safe lint
fixes.

`npm run release:safety` scans every non-ignored public-source candidate file,
including untracked files, for common credential formats, private filesystem
paths, unsafe environment files, private keys, and unexpected large files.
Keep local review evidence and private notes under the ignored `internal/`
directory.

## Pull requests

- Keep the World contract compatible with the declared `workflow` peer range.
- Add or update tests for every behavior change.
- Update the README for public API, configuration, or operational changes.
- Update `docs/architecture.md` when changing lifecycle, storage, queue,
  scaling, or failure semantics.
- Update `CHANGELOG.md` for user-visible changes.
- Do not commit credentials, connection strings, customer data, generated
  tarballs, `node_modules`, or build output.

Changes to the pinned Postgres World version require upstream changelog review,
the upstream World conformance suite, and live Heroku recovery testing. A local
unit-test pass alone is not enough evidence for that dependency change.

## Commit style

Use a short, imperative subject. Conventional Commit prefixes are encouraged:

- `feat:` for a backward-compatible feature;
- `fix:` for a bug fix;
- `docs:` for documentation only;
- `test:` for test-only work; and
- `chore:` for maintenance.

## Reporting security issues

Do not open a public issue for a suspected vulnerability. Follow
[SECURITY.md](./SECURITY.md).
