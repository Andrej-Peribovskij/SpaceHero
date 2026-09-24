# OpenSpec

Spec-driven feature workflow for product-value changes.

## Structure

```
openspec/
  config.yaml       Configuration and rules
  specs/             Baseline product specifications
  changes/           Active changes (proposals, designs, tasks)
    archive/         Completed and archived changes
```

## Workflow

1. `/opsx:propose <change-slug>` — create proposal, design, and tasks
2. `/opsx:apply <change-slug>` — implement the change
3. `/opsx:archive <change-slug>` — archive after merge

## CLI

Use npm scripts, not the CLI directly:

```bash
pnpm run spec:new <change-slug>
pnpm run spec:list
pnpm run spec:status --change <change-slug>
pnpm run spec:validate <change-slug>
pnpm run spec:archive <change-slug>
```
