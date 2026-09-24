# 02 — Wire a design version to the backend

**Run by** the design technologist.

Promote an accepted, mocked `design/vX.Y.Z` into a real, backend-wired **prod version**: the same
UI and the same flow, on real data. The two-phase gate below is inherited from the prompt this
replaces and is the strongest thing in it — Phase A produces a plan and questions and then
**stops**.

Wiring a version does **not** make it public. Prompt 06 does that, separately and deliberately.
Promoting the staging components into the shipped design system is prompt 05, also separate.

---

## Bindings

| Binding | This repository |
|---|---|
| `APP_REPO` | `.` |
| `DS_REPO` | `../design-system-uds` |
| `FRONTEND_PACKAGE` | `apps/web` |
| `DS_PACKAGE_NAME` | `@my-app/design-system` |

## Inputs

| Input | Notes |
|---|---|
| `DESIGN_VERSION` | the accepted design version, e.g. `v4.1.0` |
| `TARGET_PROD_VERSION` | the prod version to create, e.g. `v4` |
| `NOTES` | optional: anything known about the intended real behaviour |

If `DESIGN_VERSION` is not in the registry, or its PR has not been merged, stop and say so. This
prompt promotes accepted work; it does not rescue in-flight work.

---

## The rules that do not bend

1. **Phase A ends in a hard stop.** No wiring code, no mock replaced, no backend change, no
   endpoint added until the technologist answers. Producing the plan and the questions is the
   entire deliverable of the first run.
2. **Never `file:`, `link:`, `workspace:` or `portal:`** for the design system. The app consumes
   it as a published registry package, `"DS_PACKAGE_NAME": "^x.y.z"`, and nothing about wiring
   changes that. If this version needs a design-system change, that is prompt 05, not a local
   link.
3. **The UI does not change.** Layout, look, spacing and flow are the designer's, and they are
   already approved. Only the data source becomes real. Refinements the real data *demands* are
   legitimate, and they go back to the designer as a `-tech` version through prompt 03 — not
   quietly into this one.
4. **Two repos, two branches, two commits**, if the design system is touched at all. Never
   cross-commit.
5. **The magic-word gate applies to the design system too.** If any part of this run publishes a
   design-system version, it needs `APPROVE vX.Y.Z` for it, exactly as prompt 01 does. Publishing
   is never a side effect of wiring.
6. **`wired` must be true to the code.** A version that talks to a real service says so. A
   `wired` value that lies is the one unacceptable outcome, because everything downstream checks
   the field and never the folder.

---

# Phase A — analyse and plan. No backend code.

## A1. Copy the version and prove it runs on its mocks first

Copy `FRONTEND_PACKAGE/src/pages/design/DESIGN_VERSION/` to
`FRONTEND_PACKAGE/src/pages/TARGET_PROD_VERSION/` and register it in
`src/versions/registry.tsx` with:

```tsx
{ id: "TARGET_PROD_VERSION", kind: "prod", wired: false, /* … */ }
```

`wired: false` **for now**, and that is not bookkeeping — it must build, route and run on its
mocks before anything is wired, so that any breakage later has exactly one possible cause.

Two things move with the copy:

- The prod entry sits **outside** the `INCLUDE_DESIGN_VERSIONS` branch. A design version is
  dropped by that flag; a prod version never is.
- Route elements may be imported directly rather than lazily, matching the existing prod
  versions. Design versions are lazy because the flag has to be able to eliminate them; that
  reason does not apply here.

Leave the design version in place. It is the record of what was approved, and deleting it is
prompt 07's job, on an explicit manual trigger, after this version is real.

Confirm `/TARGET_PROD_VERSION` renders on mocks before continuing. Report it.

## A2. Learn the backend contract from the existing prod versions

Study it. Do not invent it. The contract already exists and is exercised by every prod version
that came before:

- `FRONTEND_PACKAGE/src/api/client.ts` — the canonical client: the service map, the proxy
  prefixes, the `request<T>()` helper, error and 204 handling, JSON vs multipart conventions.
- `FRONTEND_PACKAGE/src/hooks/useWebSocket.ts` and its call sites — the real-time channel that
  carries async results. Note how existing screens **re-hydrate on reconnect**: a socket
  broadcast is transient, and a screen that only listens misses everything that happened while it
  was away.
- `FRONTEND_PACKAGE/src/types/index.ts` — the domain types the backend actually returns.
- The existing prod pages — how each screen sequences calls and handles loading, error and empty
  states. This is your reference for what an equivalent screen here should look like.
- The owning services, when an endpoint's shape is in doubt. Read the handler, not the guess.

A wired **design** version, if the project has one, is worth more than all of the above for the
screens it covers: it is a working record of how those exact screens talk to their backends.

## A3. Map every mock to a real source

Inventory every mock in the copied version — `data/*.ts` and every place the UI reads or mutates
it — and classify each one:

| Mock | Real source | Kind | Notes |
|---|---|---|---|
| … | `api.scenarios.list()` | **Covered** | name the exact method or WS event |
| … | sequence of two calls | **Composable** | sketch the sequence |
| … | — | **Gap** | request/response shape, and which service should own it |

Be specific. "Covered by the scenarios API" is not an answer; a method name is.

## A4. Deliver the plan and the questions, then STOP

Reply with:

1. **What was copied and registered**, and the mocks-only run result from A1.
2. **The mapping table** from A3, gaps clearly flagged.
3. **The implementation plan for Phase B**: which screens get wired in what order, which client
   methods each uses, where a real-time subscription replaces a mock timer, how loading, error and
   empty states will be handled, and how each gap would be addressed.
4. **The questions.** At minimum:
   - Auth and persona context for this version — which guard wraps which route?
   - For **each gap**: build the endpoint now, stub it, or leave that screen mocked this pass?
   - Which services must be running for real data (message broker, model server, seeded
     database), and should any mock survive behind a flag as a fallback?
   - Must every screen be real in this pass, or a prioritised subset?
   - Does anything the real data revealed warrant a `-tech` revision back to the designer
     (prompt 03) rather than a change here?

**End of Phase A. Do not proceed until the answers arrive.**

---

# Phase B — implement. Only after the answers arrive.

Honour the answers. Where an answer and this prompt disagree, the answer wins; where an answer is
missing, ask again rather than assuming.

1. **Wire each screen** per the approved plan, following the existing client conventions exactly
   — service routing, JSON vs multipart, error handling, 204s. Reuse existing methods. Do not
   duplicate a call that already exists under another name.
2. **Subscribe to the real-time channel** for async results, replacing mock timers. Re-hydrate
   persisted state on every reconnect and merge it monotonically; do not assume a socket delivered
   everything that happened.
3. **Loading, error and empty states** on every wired surface, consistent with the existing prod
   versions. No silent failures, and no spinner that never resolves on an error path.
4. **Implement only the approved gaps**, in the owning service, minimal and consistent with
   sibling endpoints, plus the matching client method and types.
5. **Remove each mock as its screen becomes real**, unless a flagged fallback was explicitly
   requested — in which case gate it cleanly on an environment flag and document it.
6. **Set `wired: true`** in the registry once the version genuinely talks to real backends. If
   only part of it does, say which part in the report and in the PR, and keep the field honest.
7. **Keep the UI faithful.** Compare against the design version on screen, side by side, before
   claiming this.

## Verify — run it, do not claim it

```bash
pnpm lint                                        # root gate: 0 errors
pnpm --filter <frontend> lint
pnpm --filter <frontend> typecheck               # the app's build does NOT typecheck; this does
pnpm --filter <frontend> test
pnpm --filter <frontend> test:e2e                # routing suite
```

Then run the stack with the services the technologist named and walk the whole flow against real
data. Confirm reads, writes and real-time updates, with no console or network errors.

A wired version **writes real records**. Clicking through it is not a dry run — say so in the
report, and do not exercise a destructive path on shared data without asking first.

Report exactly what you ran and what it printed. Paste failures.

## Commit

One commit per repo, on a branch per repo. Do not push until asked; if the design system was
published, the magic word applies (rule 5).

---

## Outputs

- `FRONTEND_PACKAGE/src/pages/TARGET_PROD_VERSION/` registered as a prod version, `wired` set
  truthfully
- any approved backend endpoints, in their owning services
- a branch and one commit per repo

## Final report

1. Which screens are real and which are still mocked, and why.
2. Backend endpoints added or changed: service, route, client method, types.
3. Verification results — real-data run, lint, typecheck, tests. Pasted, not summarised.
4. Anything needing a human follow-up: a design-system publish, seeding, environment config, or a
   `-tech` revision the real data made necessary.
5. A reminder that this version is **not public**. `PUBLIC_UI_VERSION` moves only through prompt
   06, and only as an explicit decision.
