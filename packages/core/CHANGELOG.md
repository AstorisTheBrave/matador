# @matadormq/core

## 0.1.0

### Minor Changes

- 91e4c92: Add `MultiSink`: fan measurements out to several sinks at once (for example
  Prometheus and OTLP together). Each fan-out is independently fail-open, so one sink
  throwing never stops the others or reaches the worker.
- b541451: Add live queue-depth gauges. `instrument(queue)` registers a queue with a
  single-flight, short-TTL depth collector, and `PrometheusSink.attachQueueDepth()`
  exposes a scrape-time `matador_queue_depth{queue,state}` gauge. N concurrent
  scrapers cost one Redis round-trip per queue (invariant I6), and a queue whose
  read fails yields zeros plus a self-health signal rather than failing the scrape.
