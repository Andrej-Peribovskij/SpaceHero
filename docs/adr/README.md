# Architecture Decision Records

Durable architectural decisions for this project. Each ADR captures a decision,
its context, and its consequences.

## Naming

`ADR-NNN-<short-description>.md` — three-digit number, kebab-case description.

## Template

```markdown
# ADR-NNN: Title

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNN

## Context

What forces are at play? What is the problem?

## Decision

What is the change that we're making?

## Consequences

What becomes easier or harder because of this decision?
```

## Index

The four below are the decisions this template arrives with. They are load-bearing
— the scripts, the project layout, and the architecture tests all assume them —
so supersede them deliberately rather than drifting away from them.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](ADR-0001-compose-is-the-contract-and-orchestration-is-node.md) | Compose is the contract, and orchestration is Node | Accepted (engine choice narrowed by ADR-0002) |
| [0002](ADR-0002-podman-is-the-container-engine.md) | Podman is the standard container engine | Accepted |
| [0003](ADR-0003-resource-routes-and-capabilities.md) | Resource-oriented routes and capability-based authorization | Accepted |
| [0004](ADR-0004-modular-monolith-in-dotnet.md) | A modular monolith in .NET, one project per layer | Accepted |
