---
name: "Design: Create"
description: Create a mocked, administrator-only design version from a design-tool export (designer)
category: Workflow
tags: [design-process]
---

<!--
  A thin shim so /design:design-01-create works in Claude Code. It carries no
  bindings: the wrapper it includes is the single source for them, and the wrapper names the
  prompt under process/design/prompts/. Other clients include design-commands/ directly and
  never read this file. Hand-written — nothing regenerates it.
-->

@design-commands/design-01-create.md
