---
"@matadormq/core": minor
---

Add `MultiSink`: fan measurements out to several sinks at once (for example
Prometheus and OTLP together). Each fan-out is independently fail-open, so one sink
throwing never stops the others or reaches the worker.
