# ADR-0004: A modular monolith in .NET, one project per layer

**Status:** Accepted

## Context

The backend needs boundaries that survive contact with a deadline. Folder
conventions — `domain/`, `app/`, `infra/` inside one compiled unit — describe the
intended dependency direction but do not enforce it: an import from `domain` into
the ORM compiles fine, and is caught only if a reviewer happens to look. Every
codebase that starts this way accumulates framework types in its domain, and by
the time anyone measures, unpicking it is a project rather than a fix.

Microservices enforce boundaries properly and charge for it in deployment,
transactions, and local dev setup — a price worth paying when teams and release
cadences actually diverge, and not before.

## Decision

**One deployable service, composed of modules, with one .NET project per layer.**

```
services/api/src/
  Host/            Composition root: auth, errors, OpenAPI, health
  BuildingBlocks/  Framework-neutral primitives (clock, ids, actor, errors)
  Persistence/     AppDbContext, conventions, migrations, seeding
  Modules/<Name>/
    Domain/          Entities, value objects, rules — references only BuildingBlocks
    Application/     Use cases, ports, capability constants — no framework
    Contracts/       The module's only cross-module surface
    Infrastructure/  EF config, repositories, endpoints, DTOs, module wiring
```

The consequences of a project per layer are the point:

- **The compiler enforces the direction.** `Domain` cannot reference EF Core
  because the package is not referenced by that project. The mistake is a build
  error, not a review comment.
- **Architecture tests state it out loud.** `tests/Architecture` asserts that no
  `Domain`, `Application`, or `Contracts` assembly references ASP.NET Core, EF
  Core, or Npgsql. Assembly references appear only when the code actually uses
  the types, so the test catches a transitive leak too.
- **Cross-module coupling is a project reference.** A module may reference
  another module's `Contracts` and nothing else, which is visible in the
  `.csproj` and reviewable in a diff.
- **`Persistence` never references modules.** Modules contribute their mappings
  through the `IModelContributor` port, so the shared `AppDbContext` owns one
  migration stream without knowing what is in it.

**One database and one migration stream.** Modules own their tables by naming
convention (`{module}_{table}`), not by schema or connection.

**The Host is the only thing that knows every module**, through each module's
`Add<Name>Module` / `Map<Name>Module` surface.

## Consequences

Easier:

- Boundary violations fail the build or the test suite rather than being noticed
  later. That is the whole trade.
- A module can be extracted into its own service later: its layers are already
  separate assemblies and its public surface is already a `Contracts` project.
- One deployment, one database, one transaction scope, one `pnpm run dev`.

Harder:

- More projects. A new module is four `.csproj` files, an entry in `api.slnx`,
  two calls in `Program.cs`, and three architecture-test facts. This is
  boilerplate, and the enforcement is what is bought with it.
- Build times grow with project count rather than with file count.
- The `Contracts` project of a single-module system has no consumer and looks
  like ceremony. It is the boundary the second module will need, and adding it
  after the fact means moving types other code already depends on.
