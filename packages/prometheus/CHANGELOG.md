# @matadormq/prometheus

## 1.0.0

### Minor Changes

- b541451: Add live queue-depth gauges. `instrument(queue)` registers a queue with a
  single-flight, short-TTL depth collector, and `PrometheusSink.attachQueueDepth()`
  exposes a scrape-time `matador_queue_depth{queue,state}` gauge. N concurrent
  scrapers cost one Redis round-trip per queue (invariant I6), and a queue whose
  read fails yields zeros plus a self-health signal rather than failing the scrape.

### Patch Changes

- Updated dependencies [91e4c92]
- Updated dependencies [b541451]
  - @matadormq/core@0.1.0
