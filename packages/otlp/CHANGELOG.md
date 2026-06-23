# @matadormq/otlp

## 1.0.0

### Minor Changes

- 519b33b: Add `@matadormq/otlp`: an OpenTelemetry (OTLP/HTTP) `MetricsSink` exporting the same
  retry-aware latency/wait histograms and throughput counters as the Prometheus
  exporter. It is fail-open (a throwing instrument bumps a self-health counter and
  never propagates), carries only `queue`/`name` attributes, validates the endpoint
  against an http/https allowlist (SSRF-safe), and supports `forceFlush()` /
  `shutdown()`. Run it alongside the Prometheus exporter or on its own.

### Patch Changes

- Updated dependencies [91e4c92]
- Updated dependencies [b541451]
  - @matadormq/core@0.1.0
