# Deliberately local components

Components `apps/web` ships itself that the design system does not, **on purpose**.

This is the record half of prompt 05's contribution gate. When a promotion would add a component
to the shipped design system, the technologist answers one of three ways: *contribute* (a pull
request against `PTV-Mobility/design-system-uds`), *deliberately local* (a row here), or *defer*
(nothing). Without the row, the same question is asked again on the next promotion, and within a
month people answer *defer* by reflex.

A row is not an apology. "This is ours" is a legitimate answer — a component that encodes this
product's domain, a one-screen composite, a shape nobody else would want. What the row buys is
that nobody re-litigates it.

| Component | Since | Why it stays here |
|---|---|---|

*(empty — nothing has been answered* deliberately local *yet)*

## What goes in each column

- **Component** — the exported name, as `apps/web` spells it, and where it lives.
- **Since** — the design version whose promotion asked the question.
- **Why it stays here** — one sentence. "Too specific to be worth a shared version" is a complete
  answer; "not yet reviewed" is not, and means the answer was really *defer*.

## What this file is not

It is not a list of everything `apps/web` builds itself. A screen-level composite that was never
a candidate for the design system was never asked about and does not belong here — only
components a promotion actually put the question to.

Deleting a row is how a component stops being deliberately local: contribute it, or say why the
reason expired, in the same commit that removes it.

Related: [`design-staging.md`](design-staging.md) for how a component reaches promotion at all,
and [`design-system.md`](design-system.md) for consuming the published package.
