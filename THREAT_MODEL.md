# Threat model

How Matador can be attacked or misused, and what stops it. This complements
[SECURITY.md](SECURITY.md) (how to report a vulnerability) and the production
hardening in the code. It is scoped to what Matador ships: an in-process
instrumentation library embedded in a Node.js process that uses BullMQ, an
optional standalone control plane, and a bundled dashboard. The user's job code,
Redis, and the user's Prometheus/Grafana/OTLP collectors are out of scope.

## Assets

- **Worker availability.** The single most important asset. Matador must never be
  the reason a worker crashes, stalls, or slows its processing path.
- **Operational metrics** (`/metrics`, the dashboard). Aggregate, non-PII counts,
  gauges, and histograms.
- **Credentials.** The control-plane auth token(s) and any ingest/viewer split.
- **Control-plane state.** Which queues and workers exist; the audit log of
  destructive actions.
- **Redis.** The user's Redis is the single point of failure for their queues;
  Matador must never amplify load onto a struggling Redis.

## Trust boundaries

1. **The worker process <-> Matador instrumentation.** Matador runs in the user's
   event loop. A bug here can take the worker down.
2. **The network <-> the metrics/dashboard HTTP surface.** `/metrics` is open by
   default for scraping.
3. **An operator's browser/client <-> the control-plane ops API** (pause, resume,
   retry-failed, drain-DLQ).
4. **Matador <-> Redis** (reads for gauges, writes for control actions).
5. **The build/release pipeline <-> npm and GHCR** (supply chain).

## Threats and mitigations

### T1 - Instrumentation crashes or stalls the worker (boundary 1)
This is the headline guarantee. Every hook body runs inside a fail-open wrapper
that counts and swallows errors (`matador_instrumentation_errors_total`) and
never throws into the worker (invariant I3). Hooks are O(1) and do no Redis work
on the processing path (invariant I4): durations come from in-process worker
events, queue gauges use a separate Redis connection. A metrics server that
cannot bind is caught at startup and surfaced via `matador_subsystem_up`, and the
worker runs on. A single failing scrape-time gauge is isolated and skipped rather
than failing the whole `/metrics` response. Memory is bounded (the wait-time LRU
is capped).

### T2 - Unauthenticated read of operational data (boundary 2)
`/metrics` and the dashboard expose aggregate, non-PII data; `/metrics` must stay
open for Prometheus. The dashboard and any read API can be gated with a token
(constant-time compare). If a surface binds off-loopback with no token, Matador
logs a warning pointing at the fix. For anything public, bind to loopback and
reverse-proxy, or set a token.

### T3 - PII / high-cardinality leakage (boundary 2)
`jobId` and payload-derived values are never metric labels, enforced by a test,
not convention (invariant I5). The only labels are `queue` and an opt-in job
`name`; unknown or unbounded inputs must not be allowed onto a label. Per-job
detail belongs on the dashboard, never in metrics.

### T4 - Resource exhaustion on the HTTP surface (boundaries 2, 3)
Request bodies are capped. Scrape-time gauges read `getJobCounts` behind a
short-TTL single-flight cache, so N concurrent scrapers cost one Redis round-trip
(invariant I6), never a thundering herd onto Redis. The control plane rate-limits
reads and writes (per IP and per identity, `429`).

### T5 - Unauthorized or destructive control actions (boundary 3)
The control plane refuses to start on a public bind without a token. Destructive
actions (drain-DLQ, retry-failed) are idempotent, audited, and require auth even
off loopback. Tokens are compared constant-time and never logged. A confirm token
or scope check guards the irreversible actions so a single fat-fingered request
cannot wipe a queue.

### T6 - SSRF via configurable exporter endpoints (boundary 4/5)
OTLP and Pushgateway URLs are user-configured. They are validated (scheme
allowlist) and used only as configured egress targets; they are never derived
from request input, so a request cannot redirect Matador's exporter to an
internal address.

### T7 - Log injection / fingerprinting (boundaries 2, 3)
Untrusted values (queue/job names) written to logs are stripped of CR/LF and
truncated. The server version banner is stripped and security headers
(`X-Frame-Options`, `X-Content-Type-Options`, CSP, `Referrer-Policy`) are sent on
browser surfaces.

### T8 - Supply-chain compromise (boundary 5)
npm releases use provenance (OIDC, no long-lived tokens). A CycloneDX SBOM is
generated per push. CI runs CodeQL, Dependabot, and secret scanning with push
protection. Lockfile is committed and CI installs `--frozen-lockfile`.

## Residual risks / non-goals

- Matador does not provide TLS; terminate it at a reverse proxy or tunnel. Tokens
  are bearer credentials and must travel over TLS in production.
- There is no per-user RBAC: surfaces are gated by operator tokens, which is the
  intended depth for this tool.
- An operator who sets no token and binds the dashboard to a public interface
  exposes aggregate data; Matador warns but cannot refuse without also closing
  `/metrics`.
- Matador trusts the queue and worker objects it is given and the Redis they point
  at; it does not defend the user's Redis, only avoids amplifying load onto it.
