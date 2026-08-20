# Publishing and Workflow ecosystem registration

This runbook keeps the personal release, open-source source publication, and
Workflow community submission as separate, auditable gates.

## Release identity

- npm package: `@anushdsouza/world-heroku`
- public source repository: `dsouzaAnush/world-heroku`
- publisher and copyright owner: Anush D'Souza
- license: Apache-2.0

This is an independent community project. It is not affiliated with, endorsed
by, or supported by Heroku, Salesforce, Vercel, or the Workflow project.
“Heroku” is used descriptively to identify the compatible deployment platform.
The package deliberately uses the maintainer's npm scope rather than
`@heroku/*` or `@workflow/*`.

## 1. Build the release candidate

The public repository already has a clean `0.1.0` lineage. Prepare later work
on a `codex/*` or contributor branch and publish only one reviewed squash
commit. Never push intermediate branches that contain private notes,
credentials, local paths, copied prototype history, or discarded experiments.

Before the first private push:

```bash
npm ci
npm run test:release
npm run release:safety
git status --short --branch
git log --oneline --decorate origin/main..HEAD
git diff --check origin/main...HEAD
```

The expected result is a clean worktree and one public-safe candidate commit
relative to `origin/main`. If the work was developed through multiple local
commits, squash it locally before the first push, or push only a freshly
created squash branch. Do not force-push or rewrite the already public `main`
history.

Configure the public repository to allow squash merges only. Each accepted
branch must be squash-merged so `main` remains linear and reviewable.

## 2. Bootstrap the personal npm package

npm requires the package to exist before a package-level trusted publisher can
be configured. Publish `0.1.0` once from an authenticated local npm session:

```bash
npm whoami
npm publish --access public
npm view @anushdsouza/world-heroku version dist.integrity repository.url
```

The local bootstrap release does not request npm provenance. Never imply that
`0.1.0` has provenance when it does not; enable provenance for a later version
only after trusted GitHub publishing is working.

## 3. Configure future tokenless publishing

After the package exists, create the `npm` GitHub environment and configure an
npm trusted publisher with these exact values:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization | `dsouzaAnush` |
| Repository | `world-heroku` |
| Workflow file | `publish.yml` |
| Environment | `npm` |
| Allowed action | `npm publish` |

The npm CLI equivalent is:

```bash
npm trust github @anushdsouza/world-heroku \
  --repo dsouzaAnush/world-heroku \
  --file publish.yml \
  --env npm \
  --allow-publish
```

No long-lived `NPM_TOKEN` belongs in the repository or GitHub environment.
Keep the `npm` GitHub environment restricted to protected release tags and
require reviewer approval where the GitHub plan supports it.

## 4. Publish later versions

1. Update the version and `CHANGELOG.md` on a release branch.
2. Run `npm ci && npm run test:release` on the exact candidate.
3. Deploy that candidate to a disposable Heroku app, run the live lifecycle
   checklist, preserve only redacted evidence, and delete the app and add-on.
4. Run the final security diff review and public-source scanner after removing
   all local evidence from the repository candidate.
5. Review and squash-merge the pull request into `main`.
6. Confirm `main` is clean, linear, public-safe, and contains no private data.
7. Tag that exact commit as `vX.Y.Z`.
8. Publish a GitHub Release for the tag.
9. The `Publish` workflow verifies strict tag syntax, proves the tag commit is
   on `main`, verifies the tag/version match, reruns the real PostgreSQL gate,
   and publishes through npm OIDC.
10. Verify npm visibility, version, tarball contents, integrity, and install
   behavior from a clean temporary consumer.

The workflow is idempotent: if the exact immutable npm version already exists,
it verifies the registry version rather than trying to overwrite it.

## 5. Open-source gate

The canonical repository is already public. Do not rewrite its existing
`main` branch or reuse private review refs. Instead:

1. Finish release review on a local branch that has never been pushed.
2. Squash all accepted work into one public-safe commit on top of public
   `origin/main`.
3. Run the full release and public-source safety gates on that exact commit.
4. Inspect the commit, author identity, file list, and remote URL before its
   first push.
5. Confirm there are no secrets, private paths, internal URLs, customer data,
   private notes, copied private history, or misleading official branding.
6. Confirm the README's independent-project disclaimer and personal ownership.
7. Open a focused public pull request and run the Node.js 22/24/26 GitHub
   Actions matrix.
8. Squash-merge through GitHub; do not force-push or replace public history.

Once public, `--provenance` may be added to the publish workflow for a new
version after verifying npm's current provenance requirements. Existing npm
versions cannot be republished to add provenance retroactively.

## 6. Add the World to the Workflow community

The Workflow documentation directs third-party maintainers to publish their
World independently and then submit it to
[`vercel/workflow`'s `worlds-manifest.json`](https://github.com/vercel/workflow/blob/main/worlds-manifest.json).
The manifest is the source for the Worlds ecosystem site.

Submit only after both public URLs work:

- `https://github.com/dsouzaAnush/world-heroku`
- `https://www.npmjs.com/package/@anushdsouza/world-heroku`

Submission sequence:

1. Fork `vercel/workflow` and create a focused branch.
2. Copy the object from
   [`worlds-manifest-entry.json`](./worlds-manifest-entry.json) into the
   manifest's `worlds` array.
3. Run the upstream formatter and manifest checks.
4. Verify the generated community matrix includes the `heroku` entry with its
   PostgreSQL service and environment variables.
5. Open a PR titled `docs(worlds): add unofficial Heroku community World`.
6. Link the npm package, public repository, conformance evidence, and any live
   Heroku recovery evidence.

In the audited 2026-08-19 upstream snapshot, community entries render from the
manifest, but community E2E jobs on `main` are disabled and the reusable E2E
workflow does not execute the manifest's `setup` field. Therefore a manifest
merge proves listing, not an upstream compatibility badge or benchmark. Keep
this repository's conformance suite as the executable evidence until upstream
runs and publishes its own result.

## 7. Verify a registry release

From a clean temporary consumer:

```bash
npm view @anushdsouza/world-heroku version dist.integrity repository.url
# Add the README's tested Workflow 4 overrides to the root package.json.
npm install workflow @anushdsouza/world-heroku
npm audit --omit=dev --audit-level=high
npx workflow-heroku-bootstrap
```

For production-readiness claims, also deploy the packed example to an actual
Heroku application with Heroku Postgres and capture deploy, dyno restart,
graceful shutdown, rollback, and database-interruption evidence. Local
PostgreSQL conformance is necessary but does not prove Heroku process-lifecycle
behavior.
