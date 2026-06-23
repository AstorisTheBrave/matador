# Releasing

Matador uses [changesets](https://github.com/changesets/changesets) to version
and publish the public packages (`@matadormq/core`, `@matadormq/prometheus`,
`@matadormq/otlp`, and the control-plane packages as they land).

Publishing is tokenless via [npm Trusted Publishing
(OIDC)](https://docs.npmjs.com/trusted-publishers/): no long-lived tokens, nothing
to rotate, 2FA stays on, and provenance is automatic. The only catch is npm's
rule that a trusted publisher cannot be configured for a package that does not
exist yet, so the very first publish of each new package is done locally.

## One-time bootstrap (first publish of a new package)

1. Create the npm org once (free): https://www.npmjs.com/org/create, name
   `matadormq`, free ("unlimited public packages") plan.

2. Apply the pending version bump and publish locally:

   ```sh
   git checkout main && git pull
   pnpm changeset version      # consumes changesets, bumps versions + CHANGELOGs
   pnpm install                # refresh the lockfile
   pnpm -r build
   npm login                   # interactive, completes 2FA
   pnpm -r publish --access public
   git add -A && git commit -m "chore: version packages" && git push origin main
   ```

   `pnpm -r publish` skips the private example packages. After this, the pushed
   version commit makes any open "Version Packages" PR obsolete (close it); the
   Release workflow run on that push finds nothing new to publish and is a no-op.

3. Configure Trusted Publishing for each published package on npmjs.com:
   package page -> Settings -> Trusted Publisher -> GitHub Actions, with
   - Organization or user: `AstorisTheBrave`
   - Repository: `matador`
   - Workflow filename: `release.yml`

   Do this for `@matadormq/core`, `@matadormq/prometheus`, `@matadormq/otlp`.

After step 3, no token is ever needed again.

## Ongoing releases (fully automated, tokenless)

1. Every user-facing change includes a changeset: `pnpm changeset` (pick packages
   and a semver bump, write a user-facing summary).
2. On merge to `main`, the Release workflow (`.github/workflows/release.yml`) opens
   a "chore: version packages" PR.
3. Merging that PR triggers the workflow again, which publishes the bumped packages
   to npm via OIDC, with provenance, and creates GitHub Releases. No secret
   required (only `id-token: write`, already set).

## Pre-1.0 policy

While Matador is `0.x`, minor bumps may include breaking changes; keep changeset
summaries explicit about anything that breaks. The seven invariants are stable and
are not expected to change across releases.

## Checklist before a release

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green.
- [ ] Integration tests pass against a real Redis (CI `test` job).
- [ ] Dependabot alerts at zero; `npm audit` clean for runtime deps.
- [ ] SBOM workflow green.
- [ ] Full scored production-readiness review for a major surface (see the
      standards doc).
