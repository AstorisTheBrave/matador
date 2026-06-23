---
"@matadormq/control": minor
---

Add `@matadormq/control`: a standalone, secure-by-default control plane for BullMQ.
It exposes read views (queue list/detail with a bounded, payload-stripped DLQ
sample, single-flight cached) and safe operational actions (pause, resume,
retry-failed, drain-DLQ) over an authenticated fastify API. Destructive actions are
idempotent, audited, bounded, and the drain requires a confirm token matching the
queue name. Ships a `matador-control run|doctor` CLI, a Dockerfile, control-plane
self-metrics (`matador_subsystem_up`), per-IP rate limiting, security headers, an
atomic schema-versioned state file, and a single-writer lock. It also serves a
minimalist dashboard SPA (queue list, per-queue detail with a DLQ sample, and the
safe-ops actions with a type-to-confirm drain) at `/`.
