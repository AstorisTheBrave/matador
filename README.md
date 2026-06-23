# Matador

Drop-in observability and operations control plane for [BullMQ](https://bullmq.io).

Matador instruments your existing BullMQ workers and queues with **one line** and
exports deep, correct metrics - latency and wait-time histograms, throughput,
failures, retries, and live queue depth - to Prometheus and OpenTelemetry. It adds
a dashboard, fleet view, and safe operational actions on top, all open source.

> Status: early development. The core instrumentation seam and the Prometheus
> exporter land first; OTLP, the dashboard, and the control plane follow.

## Why

BullMQ now ships a basic Prometheus export, and several exporters expose queue
counts. Matador is not trying to re-expose gauges. It focuses on what is hard or
missing:

- **Correct, retry-aware wait-time** - the time a job actually waited before an
  attempt started, without the inflation you get from naively subtracting the
  creation timestamp across retries.
- **Per-attempt processing-latency histograms** (p95/p99), not just per-minute
  counts.
- **OpenTelemetry (OTLP) metrics**, in addition to Prometheus.
- An **open-source dashboard, fleet view, and safe ops** (pause/resume,
  retry-failed, drain-DLQ) across many workers.

## Design invariants

1. **One-line integration** - `instrument(worker)` / `instrument(queue)`, zero
   changes to job code.
2. **Neutral core, adapter seam** - the core imports no exporter; exporters
   implement a small interface.
3. **Fail-open** - instrumentation never throws into your worker or crashes the
   process; it degrades, your app does not.
4. **Zero hot-path cost** - durations come from in-process worker events; queue
   gauges use a separate Redis connection. No blocking work on the processing path.
5. **Bounded cardinality** - labels are `queue` and (opt-in) job `name` only.
6. **Single-flight scrape cache** - many scrapers cost one Redis round-trip.
7. **One config funnel** - kwargs > env > defaults; nothing else reads the env.

## Packages

| Package | Description |
| --- | --- |
| `@matadormq/core` | Neutral registry + one-line fail-open instrumentation. |
| `@matadormq/prometheus` | Prometheus `MetricsSink` and `/metrics` endpoint. |

## Quick start

```sh
pnpm add @matadormq/core @matadormq/prometheus
```

```ts
import { Worker } from 'bullmq';
import { instrument } from '@matadormq/core';
import { PrometheusSink, metricsPlugin } from '@matadormq/prometheus';
import Fastify from 'fastify';

const sink = new PrometheusSink();
const worker = new Worker('emails', handler, { connection });

instrument(worker, { sink }); // the whole integration

const app = Fastify();
metricsPlugin(app, sink); // serves /metrics
await app.listen({ port: 3000 });
```

## Documentation

Full docs are in the [wiki](https://github.com/AstorisTheBrave/matador/wiki):
[Getting Started](https://github.com/AstorisTheBrave/matador/wiki/Getting-Started),
[Architecture and Invariants](https://github.com/AstorisTheBrave/matador/wiki/Architecture-and-Invariants),
[Metrics Reference](https://github.com/AstorisTheBrave/matador/wiki/Metrics-Reference),
[Configuration](https://github.com/AstorisTheBrave/matador/wiki/Configuration),
[OTLP](https://github.com/AstorisTheBrave/matador/wiki/OTLP), and
[Security](https://github.com/AstorisTheBrave/matador/wiki/Security).

## Development

```sh
corepack enable
pnpm install
docker compose up -d redis   # for integration tests
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

## License

AGPL-3.0-only - see [LICENSE](./LICENSE). The network-copyleft clause means if you
run a modified Matador as a hosted service, you must make your modified source
available to its users. Use it freely; don't take it closed-source.
