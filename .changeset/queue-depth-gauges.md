---
"@matador/core": minor
"@matador/prometheus": minor
---

Add live queue-depth gauges. `instrument(queue)` registers a queue with a
single-flight, short-TTL depth collector, and `PrometheusSink.attachQueueDepth()`
exposes a scrape-time `matador_queue_depth{queue,state}` gauge. N concurrent
scrapers cost one Redis round-trip per queue (invariant I6), and a queue whose
read fails yields zeros plus a self-health signal rather than failing the scrape.
