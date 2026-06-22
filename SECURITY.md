# Security Policy

## Reporting a Vulnerability

Please report security issues privately using GitHub's **"Report a vulnerability"**
button under the repository's **Security** tab (Private Vulnerability Reporting).
Do not open public issues for security problems.

We aim to acknowledge reports within 72 hours and to ship a fix or mitigation
as quickly as the severity warrants.

## Scope

Matador is a library plus an optional control-plane service. Security-relevant
areas include:

- The control-plane HTTP API (authentication, input validation, safe operations).
- Configurable exporter endpoints (OTLP / Pushgateway URL handling).
- Handling of untrusted job and queue names in queries and the UI.

## Secure Defaults

- Metrics carry only bounded labels (`queue` and optional job `name`); never job
  IDs or payload-derived values.
- Instrumentation is fail-open: it never throws into your worker or queue.
- The control plane refuses to bind to a public interface without an explicit token.
