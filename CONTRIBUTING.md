# Contributing to Matador

Thanks for your interest. Matador is a TypeScript monorepo (pnpm workspaces) that
provides drop-in observability and operations for BullMQ.

## Development setup

```sh
corepack enable
pnpm install
docker compose up -d redis   # Redis for integration tests
```

Run the full check suite before opening a PR:

```sh
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Integration tests against a real Redis run automatically in CI and locally when
`REDIS_URL` is set:

```sh
$env:REDIS_URL = "redis://localhost:6379"; pnpm test   # PowerShell
REDIS_URL=redis://localhost:6379 pnpm test             # bash
```

## The invariants

Every change must preserve the seven invariants (see the architecture docs).
They are enforced by tests, not by convention:

1. One-line integration; no changes to job code.
2. The core imports no exporter; exporters implement `MetricsSink`.
3. Fail-open: instrumentation never throws into the worker.
4. Zero hot-path cost: durations from in-process events, gauges on a separate
   Redis connection.
5. Bounded cardinality: labels are `queue` and opt-in `name` only.
6. Scrape-time gauges read `getJobCounts` behind a short-TTL single-flight cache.
7. One config object; nothing else reads the environment.

If a change cannot keep an invariant, it needs discussion first.

## Commits and releases

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
  `fix:`, `feat!:` / `BREAKING CHANGE:`, `chore:`, `ci:`, `docs:`, `test:`,
  `build:`, `refactor:`.
- Add a changeset for any user-facing change: `pnpm changeset`.
- Versioning and changelogs are derived from changesets. See
  [RELEASING.md](RELEASING.md).

## Code style

- TypeScript strict. `pnpm typecheck` and `pnpm lint` must be clean.
- Prettier (line width 100, single quotes). Run `pnpm format:write`.
- Small, focused files with one clear responsibility. DRY, YAGNI.
- No placeholders left behind.

## Reporting security issues

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

By contributing you agree your contributions are licensed under the project's
[AGPL-3.0-only](LICENSE) license.
