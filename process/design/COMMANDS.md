# Commands recap — the seven prompts, when to use them, and ready-to-use examples

A one-page operator's guide to the design → code process. Each of the seven prompts is a **role
playbook**: in Claude Code you run it as `/design:design-NN-*`, which includes its tool-neutral
wrapper (`design-commands/design-NN-*.md` at the repository root); the wrapper points your LLM
client at the prompt and carries this repository's bindings. This file tells you **which** prompt to reach for, **who** runs it, and gives a
**credible, ready-to-use example** you can adapt verbatim.

> New here? Read [`README.md`](README.md) for the model and [`roles.md`](roles.md) for who the
> designer / design technologist are. [`design-commands/README.md`](../../design-commands/README.md)
> covers the wrappers, the bindings they carry, and what this repository has to keep true.

---

## How you actually invoke a prompt

The wrappers are **tool-neutral** on purpose — they are plain Markdown, not tied to any one LLM
client. Three equivalent ways to run one:

- **In Claude Code — the standard**: run the slash command, e.g. `/design:design-01-create`, and
  supply the inputs. The commands in `.claude/commands/design/` are thin shims whose body only
  `@`-includes the wrapper, so they add no binding and change nothing about the run.
- **In a client that reads the repository**: reference the wrapper directly, e.g.
  `@design-commands/design-01-create.md`, and supply the inputs.
- **In any chat client**: paste the prompt body (or `@`-reference the wrapper file) and then give
  the inputs in prose. The agent reads the bindings block from the wrapper and follows the prompt.

Every example below is written for the last, universal case, so it works in any client. In Claude
Code, `/design:design-NN-*` followed by the same prose does the same thing.

The **bindings** (which repositories, packages, commands and URLs this maps to) live in the
wrapper; you don't repeat them. Here they are `APP_REPO=.`, `DS_REPO=../design-system-uds`,
`FRONTEND_PACKAGE=apps/web`, `DS_PACKAGE_NAME=@space-hero/design-system` — the full list, and what
each one answers, is in
[`design-commands/README.md`](../../design-commands/README.md#the-bindings-and-what-each-one-answers).

---

## The loop at a glance

```
        designer                        design technologist
        ────────                        ───────────────────
  01 create design version   ─────▶   02 wire version to backend
        ▲                                     │
        │                                     ▼
  04 preview & export  ◀─────────────  03 tech revision (-tech)
                                              │
                                     05 promote DS staging   (components → shipped)
                                     06 promote public       (flip PUBLIC_UI_VERSION)
                                     07 clean design versions (manual, explicit)
```

- **01 → 02** is the forward path: a mocked design becomes a real, backend-wired version.
- **03 → 04** is the feedback loop: wiring surfaces UX gaps → back to the designer → next cycle.
- **03 runs in two directions** — technologist → designer (wiring gaps), *or* developer →
  technologist (a new frontend version that needs a design eye). Both hand a `-tech` version up one
  role for a design review before it re-enters the loop.
- **05 / 06** are the two independent "go live" levers (components, then the public flip).
- **07** is destructive cleanup — manual, explicit, never automatic.

---

## 01 — Create a design version · _designer_

**Use when:** you have a fresh export from the design tool ("Handoff to Claude Code" output) and
want it running as a **mocked, admin-only** `design/vX.Y.Z` inside the app, plus its design-system
staging area. Nothing public changes; nothing leaves the machine until you type `APPROVE vX.Y.Z`.

**Inputs:** `SOURCE_PATH` (the export), `SUMMARY` (1–3 sentences), optional `DESIGN_NOTES`, and one
publish mode.

**The publish mode, because the default changed and it is the thing most worth knowing:**

| Mode | The design-system publish happens | Reach for it when |
|---|---|---|
| `--publish-on-approve` | at the end, with the push, after `APPROVE vX.Y.Z` | **the default. Say nothing and you get this.** |
| `--publish` | mid-run, before you have seen a screen | you need the registry round-trip proven before porting — and you accept a permanent write to a shared registry made before the gate |
| `--no-publish` | never | offline; a networked machine publishes and repins later |

The default exists because a design-system version cannot be withdrawn, every other project reads
that registry, and a designer who iterated three times on a staged component used to burn three
permanent versions of it before typing the magic word. It has a cost the prompt states plainly and
you should expect to see in the report: **while the staging version is unpublished, the screens
importing a newly staged component cannot be typechecked, tested, built or clicked through.** The
prompt verifies them after the publish, at approval, and names which checks were deferred. On a run
that stages nothing — a likely outcome, see below — the mode is irrelevant and there is nothing to
publish.

**Two things this prompt now does that it did not:**

- **It skips the whole design-system lane when nothing needs staging.** Every component in the
  export is classified against what the design system already ships, and the measured outcome is
  that most of them are *adoption gaps* rather than new work. When nothing is new or changed there
  is no design-system branch, build, publish, repin, commit or PR — one repo, one commit, one pull
  request, and no registry token needed on the machine at all. The report says so in those words,
  because a run that produced no design-system work and a run that forgot to look are otherwise
  indistinguishable.
- **It picks the preview runtime from the version, not from the prompt.** A design version is
  mocked, so what it needs is not a backend but an administrator session — `/design/*` is
  administrator-only. Where the optional design-preview seam exists, that is `DESIGN_PREVIEW_CMD`
  and the frontend is all a designer runs; where it does not — which is here today — it is
  `FULL_STACK_CMD` exactly as before. Both are supported. A run that tells you it used
  `FULL_STACK_CMD` because no seam is declared is reporting an adoption opportunity, not an error.

**Ready-to-use example** (paste into your LLM client):

> Execute the design prompt in `design-commands/design-01-create.md`.
> I've pasted the design-tool handoff into `C:/handoffs/planner-v4.1.0/` — that's the `SOURCE_PATH`.
> `SUMMARY`: "v4.1.0 is the PT-planner redesign — three screens (roadwork intake, impact review,
> operator confirmation) with the new left-rail stepper flow."
> `DESIGN_NOTES`: "introduces a compact `InsightCard` header variant and a `Stepper` with per-step
> error state — stage these, don't touch the shipped components."
> Follow the prompt exactly, stop at the magic-word gate, and show me the plan before pushing.

> _Claude-Design variant (when the code comes from a Design chat):_
> "I generated this version's code with the Claude design prompt below — run it, then feed the
> generated export into `design-commands/design-01-create.md` as `SOURCE_PATH`.
> Design prompt: _‹paste the Claude design prompt / share link here›_.
> `SUMMARY`: ‹one line›. Default publish mode is fine — I want to approve before anything reaches
> the registry."

> _Why that line changed:_ it used to say "use `--no-publish` for now; I'll approve the publish
> separately", which is now a description of the default. `--no-publish` means *never*, in this run
> and after approval, and it leaves a repo pinned to a version the registry does not serve.

---

## 02 — Wire a design version to the backend · _design technologist_

**Use when:** a design version has been **accepted and its PR merged**, and you want to promote it
into a real, backend-wired **prod version** — same UI, same flow, real data. Wiring does **not**
make it public (that's 06) and does **not** promote its components (that's 05).

**Inputs:** `DESIGN_VERSION` (e.g. `v4.1.0`), `TARGET_PROD_VERSION` (e.g. `v4`), optional `NOTES`.

**Note the two-phase gate:** Phase A produces a plan + questions and then **stops** — no code until
you answer.

**Ready-to-use example:**

> Run `design-commands/design-02-wire.md`.
> `DESIGN_VERSION`: `v4.1.0` (merged yesterday, it's in the registry).
> `TARGET_PROD_VERSION`: `v4`.
> `NOTES`: "the roadwork-impact screen should read live KPIs from the traffic-assignment engine over
> Kafka request-reply, not the mock; the operator-confirmation step writes back through the hub."
> Do Phase A only: give me the wiring plan and your open questions, then stop. I'll answer before
> you touch any code.

---

## 03 — Tech revision · _runs in two directions_

Command 03 hands a **refinement up one role** as a new backend-wired `design/vX.Y.Z-tech` version
plus a PR written for the reviewer to read. It runs in **two directions**, both cases where a new or
changed frontend needs a **design eye** before it can be trusted:

- **Design technologist → designer** — while wiring (02) you hit UX problems the **mock couldn't
  reveal** (an empty list in practice, an undesigned error state, a missing confirmation step).
  Instead of quietly "fixing" it in a public version, you send it back to the **designer**.
- **Developer → design technologist** — you need to integrate a **new frontend version** that must
  be **touched with care** (a design decision is involved, not a mechanical change). Rather than
  merging it blind, you send it up to the **design technologist** so a design eye validates it
  before it re-enters the loop.

In both cases the deliverable is identical: a `-tech` version and a PR addressed to the role above.

**Inputs:** the version you're revising and a description of the changes — the real-world gaps found
(technologist→designer) or the new-frontend integration that needs a design eye (developer→technologist).

**Ready-to-use example** (technologist → designer):

> Run `design-commands/design-03-tech-revision.md`.
> While wiring `v4` from `v4.1.0` I found three things the mock hid: (1) the impact list is empty
> for corridors with no detour, and there's no empty state; (2) the KPI fetch can time out — no
> error state exists; (3) operators expect a "confirm before publish" step that the design skips.
> Produce `design/v4.1.0-tech` capturing these as real, backend-wired screens, and open a PR
> addressed to the designer explaining each change and why the mock couldn't show it.

**Ready-to-use example** (developer → design technologist):

> Run `design-commands/design-03-tech-revision.md`.
> I need to integrate a new frontend version onto `v4.1.0` — it touches layout and interaction, so
> it needs a design eye before it goes further. Capture it as `design/v4.1.0-tech` and open a PR
> addressed to the design technologist, calling out exactly what I changed and which parts need a
> design decision rather than a rubber-stamp.

---

## 04 — Preview and export · _designer_

**Use when:** a technologist has sent you a `-tech` revision and you want to **review it live**, then
**export it back into the design tool** so the next visual iteration starts in the design tool (and
the loop returns to 01). **Or** you want to start a design pass from **what ships today** — export
the production version directly, with no `-tech` revision in between. This prompt only
reads/writes a zip — nothing is pushed or published.

**Inputs:** `VERSION` (e.g. `v4.1.0-tech`, must be in the registry; for a production export, a
production id — or leave it out and the prompt exports the public version), optional `PR_BRANCH`,
optional `OUTPUT_PATH`.

**Its two halves share nothing, and the export is a supported entry point on its own.** Preview
needs a checkout, an install and a runtime; the exporter is pure `node:fs` and regex — no install,
no dev server, no backend, no container, no browser. If you want only the zip, ask for only the
zip: it needs `VERSION` and two directories on disk, and nothing else. Both halves in one run is
still the common case, no longer the only one.

**A `-tech` revision is normally `wired: true`**, and then the preview does need the full stack —
its screens call real endpoints, and a frontend-only server shows them failing, which reads as a
broken revision and is not. The prompt reads the version's `wired` field and tells you which
command it ran and why. That is the one place prompt 04 is more expensive than prompt 01, and it is
a property of the version rather than of the prompt.

**Ready-to-use example** (review, then export):

> Run `design-commands/design-04-preview-export.md`.
> `VERSION`: `v4.1.0-tech`. It's on `PR_BRANCH` `design/v4.1.0-tech` — check it out only if my tree
> is clean, otherwise stop and tell me.
> Serve it locally so I can click through the three screens, then export it to
> `OUTPUT_PATH` `C:/handoffs/planner-v4.1.0-tech-export/` in the design-tool-readable format.
> Don't push or publish anything.

**Ready-to-use example** (export only — no preview, no install, no stack):

> Run `design-commands/design-04-preview-export.md`, export half only.
> `VERSION`: `v4.1.0-tech` — the files are already checked out, so don't start a server, don't
> install anything and don't check out a branch. Just run the exporter and write the zip to
> `OUTPUT_PATH` `C:/handoffs/planner-v4.1.0-tech-export/`.
> Tell me which components it copied and anything it flagged that has no reference image.

**The production export is the same wrapper in a different mode, not another command.** It starts
from the registry's production entry — the version real users get — and walks every file its
screens reach, so it works for a version that was never one folder. It needs no install, no stack
and no backend. What it cannot do is invent data: a wired version's screens read everything from
the API, so the zip carries the answers the repository recorded (`FIXTURES_DIR`), or says plainly
that it carries none. In this repository `FIXTURES_DIR` is `null`, so it says none.

**Ready-to-use example** (export what ships):

> Run `design-commands/design-04-preview-export.md`, production export.
> Export the version the app serves publicly today — not a design version, no `-tech` revision —
> to `OUTPUT_PATH` `C:/handoffs/current-ui/`. Don't start anything or install anything.
> Tell me which version it was, what it could not include, and what the mock data is.

---

## 05 — Promote design-system staging · _design technologist_

**Use when:** a design version is accepted and its **staged components should become part of the
shipped design system** (folding `src/staging/vX.Y.Z/` back into `src/components/` and
republishing). This is the **highest-risk prompt** — it's the one operation allowed to change what
the public app renders. Treat every step as load-bearing.

**Inputs:** the version whose staged components to promote (and the DS version bump it implies).

**Ready-to-use example:**

> Run `design-commands/design-05-promote-ds.md`.
> Promote the components staged for `v4.1.0` (`src/staging/v4.1.0/` in `../design-system-uds`) into the shipped
> design system: the `InsightCard` header variant and the error-state `Stepper`.
> Bump `@space-hero/design-system` accordingly, keep the two-repo/two-commit rule, and show me the
> visual-baseline diff for the shipped Storybook stories before anything is published. Stop before
> publishing so I can approve.

---

## 06 — Promote a version to public · _design technologist_

**Use when:** a **prod, wired** version is ready for real users and you want to flip
`PUBLIC_UI_VERSION` — the single runtime value naming the version the world sees. It's a runtime env
edit + backend restart (**no frontend rebuild**), so rollback is one line. The *decision* is never
automatic; only a prod+wired version is eligible (design/mocked versions are hard stops).

The *edit* is. `PUBLIC_VERSION_APPLY_CMD` in the wrapper writes every place the repository declares
the public version, in one command — the host's committed defaults. The deployment's own
`PUBLIC_UI_VERSION` is a separate, deliberate act, and stays one.

**Inputs:** `TARGET_VERSION` (e.g. `v4`, must be in the registry), `ENVIRONMENT` (which deployment
to set).

**Ready-to-use example:**

> Run `design-commands/design-06-promote-public.md`.
> `TARGET_VERSION`: `v4` (prod, wired, in the registry).
> `ENVIRONMENT`: `production`.
> Before changing anything, show me the change report: what users gain, what's lost, and which live
> shared links (e.g. mailed reviewer links) break. I'll confirm after reading it. Remind me of the
> one-line rollback in your summary.

---

## 07 — Clean up design versions · _design technologist, manual only_

**Use when:** you want to **delete named, superseded design versions** and every trace of them.
**Manual trigger only** — never automatic, never offered as a "next step", never a pattern/range.
You must name the exact versions and the prod version that carries their promoted work.

**Inputs:** `VERSIONS` — an **explicit list**. No wildcards, no "the old ones", no ranges.

**Ready-to-use example:**

> Run `design-commands/design-07-clean.md`.
> Delete exactly these design versions: `v4.0.0`, `v4.1.0`, `v4.1.0-tech`.
> Their work shipped in prod version `v4`, which is now public — so they're safe to remove. Do not
> touch any version I haven't named, and if any of these isn't demonstrably superseded, stop and
> tell me instead of guessing.

---

## Quick reference

| # | Command wrapper | Role | One-line purpose | Leaves the machine? |
|---|---|---|---|---|
| 01 | `design-01-create` | designer | export → mocked admin-only `design/vX.Y.Z` | **default (`--publish-on-approve`): no — push *and* registry publish both wait for `APPROVE vX.Y.Z`.** Under `--publish` the design-system publish happens mid-run, before you have seen a screen, and cannot be withdrawn |
| 02 | `design-02-wire` | technologist | accepted design → backend-wired prod version | Phase A: no |
| 03 | `design-03-tech-revision` | technologist → designer, or developer → technologist | refinement needing a design eye → `-tech` version + PR up one role | yes (PR) |
| 04 | `design-04-preview-export` | designer | review `-tech` live, export zip for design tool — or export alone, with no runtime at all — or export the production version that ships | no (zip only) |
| 05 | `design-05-promote-ds` | technologist | staged components → shipped design system | yes (publish) |
| 06 | `design-06-promote-public` | technologist | flip `PUBLIC_UI_VERSION` (runtime, no rebuild) | yes (env + restart) |
| 07 | `design-07-clean` | technologist | delete explicitly-named design versions | yes (deletes) |
