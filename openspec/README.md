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

## The `/opsx` commands are ours

`.claude/commands/opsx/*.md` began as OpenSpec's generated commands and has
been edited here since: `archive.md`, for one, offers verification and archives
through `spec:archive`. `pnpm run spec:update` (`openspec update`) rewrites
every one of them from OpenSpec's templates, without looking at what is there.
After running it, review the diff under `.claude/commands/opsx/` and restore
what it dropped. `scripts/opsx-commands.test.mjs` fails on the edits it
protects.
