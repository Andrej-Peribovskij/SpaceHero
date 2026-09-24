# Design-tool brief

The prompt a designer hands to the design tool (Claude Design, Figma Make, or equivalent) when
starting a new version. Its job is to make the tool's output land cleanly in prompt 01 instead of
needing a translation pass.

---

## What the brief must carry

| Section | Why |
|---|---|
| **The design system** | The tool should compose from existing components, not invent parallel ones. Every invented primitive becomes a staging component someone has to review. |
| **Token vocabulary** | Colour, typography, spacing and elevation tokens by name, so output uses the vocabulary the codebase already speaks. |
| **The existing flow** | Screen inventory and navigation graph of the version being evolved. |
| **What is changing** | The actual design intent for this version. |
| **The increment** | Whether this is an X, Y or Z bump, and what that implies about how much may change. |
| **Output conventions** | One folder per screen; mock data separated from presentation; no backend calls; component names matching the design system where a component already exists. |

---

## What to ask the tool *not* to do

- invent primitives that already exist in the design system under another name
- inline colour or spacing values where a token exists
- build routing or navigation infrastructure — the app owns that
- call any real service

---

## Round trip

The brief is the **outbound** half. The inbound half is the tool's "Handoff to Claude Code"
export, which becomes prompt 01's `SOURCE_PATH`.

For an *evolution* of an existing version rather than a fresh design, the designer first runs
prompt 04 to export the current version as a readable source tree, imports it into the tool, and
briefs the tool against that. The tool rebuilds the screens as editable design components, and
the designer tweaks from there.
