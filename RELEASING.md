# Releasing

Matador uses [changesets](https://github.com/changesets/changesets) to version
and publish the public packages (`@matador/core`, `@matador/prometheus`, and the
exporters/control-plane packages as they land).

## Flow

1. Every user-facing change includes a changeset:

   ```sh
   pnpm changeset
   ```

   Pick the affected packages and a semver bump (patch / minor / major), and
   write a short, user-facing summary. The file lands in `.changeset/`.

2. When changesets accumulate on `main`, run the version step to consume them,
   bump versions, and update each package CHANGELOG:

   ```sh
   pnpm version
   ```

   Commit the result (`chore: version packages`).

3. Publish with provenance from CI (preferred) or locally:

   ```sh
   pnpm -r build
   pnpm -r publish --access public --provenance
   ```

   Provenance requires publishing from a trusted CI context (OIDC). Do not use
   long-lived npm tokens.

## Pre-1.0 policy

While Matador is `0.x`, minor bumps may include breaking changes; keep the
changeset summaries explicit about anything that breaks. The seven invariants are
stable and are not expected to change across releases.

## Checklist before a release

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green.
- [ ] Integration tests pass against a real Redis (CI `test` job).
- [ ] Dependabot alerts at zero; `npm audit` clean for runtime deps.
- [ ] SBOM workflow green.
- [ ] Full scored production-readiness review for a major surface (see the
      standards doc).
