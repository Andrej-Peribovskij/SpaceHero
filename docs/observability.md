# Observability

Purpose: how error reporting and analytics work in this project.

## Model

- Vendor concepts stay behind ports in `apps/web/src/infra/observability`:
  `ErrorReporter` and `AnalyticsTracker`. Use hooks — never import a vendor
  SDK at a call site.
- **ErrorReporter** is inert without configuration. No DSN → calls are no-ops.
- **AnalyticsTracker** is inert without an API key. No key → calls are no-ops.

## Privacy and PII

No raw PII reaches vendors. Layers, in order of reliability:

1. **Disable auto PII** — error reporter does not auto-attach IP, cookies, or
   headers.
2. **Identity is the raw user id only.** Email and name never leave the browser.
3. **Redaction (defence-in-depth).** A `beforeSend` chokepoint scrubs events
   before they leave the browser.

**Residual risk — PII as prose.** Redaction is pattern-based, so it cannot catch
personal data that fits no pattern. The primary guard is the call site:

- Keep raw user input out of error messages, breadcrumbs, and metadata.
- Treat the redactor as a backstop, not a licence to pass PII.

## Debugging

- Every request carries `x-request-id` (UUID v7) for cross-surface correlation.
- Join frontend error events to backend logs via `x-request-id`.

## Good practices checklist

- Report through hooks; never touch vendor SDKs directly.
- Report handled errors worth keeping; let global handlers catch the rest.
- Handle expected transport failures locally.
- Keep PII out of messages, breadcrumbs, and metadata at the call site.
- Set identity once (raw user id); never re-send it in event properties.
- Never set `x-request-id` by hand; the HTTP client owns it.
