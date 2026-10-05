---
name: "OPSX: Archive"
description: Archive a completed change in the experimental workflow
category: Workflow
tags: [workflow, archive, experimental]
---

Archive a completed change in the experimental workflow.

**Input**: Optionally specify a change name after `/opsx:archive` (e.g., `/opsx:archive add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   Run `pnpm run spec:list --json` to get available changes. Use the **AskUserQuestion tool** to let the user select.

2. **Check artifact completion status**

   Run `pnpm run spec:status --change "<name>" --json` to check artifact completion.

   **If any artifacts are not `done`:**
   - Display warning listing incomplete artifacts
   - Prompt user for confirmation to continue

3. **Check task completion status**

   Read the tasks file to check for incomplete tasks.

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Prompt user for confirmation to continue

4. **Offer verification — do not require it**

   A ticked task is a claim that some behaviour exists, and nothing has checked
   it. Once the change is archived its requirements stand as settled, and a tick
   that ran ahead of the code is no longer questioned by anyone. This is the last
   cheap moment to catch one.

   This repository has no automated verifier, so the check is a question to the
   user. Read the tasks file and print a checklist of every **ticked** task that
   describes behaviour (skip ones that are only docs, formatting or running a
   gate), each with the file or test you would expect to prove it:

   ```
   Before archiving <name> — were these checked against the code?

     [x] 2.1 Reject an expired invitation   → services/api/…/AcceptInvitation*.cs, its test
     [x] 2.3 Show the error on the form     → apps/web/src/…/invite-form.tsx
   ```

   If no ticked task describes behaviour, say so in one line and go on.
   Otherwise use the **AskUserQuestion tool** with three options:

   - **I verified them** — proceed to step 5.
   - **Check them now** — stop here without archiving. Read each claimed file
     and test against its task, report what matches and what does not, and let
     the user decide; `/opsx:archive` is run again afterwards.
   - **Archive without verifying** — proceed to step 5, and say so in the
     summary.

   **Never** refuse to archive because the user skipped this, argue with the
   answer, or check the code without being asked. It is offered, not required.

5. **Perform the archive**

   ```bash
   pnpm run spec:validate <name>
   pnpm run spec:archive <name>
   ```

   `spec:archive` does two things, and both matter. It applies the change's
   delta specs (`specs/<capability>/spec.md`: ADDED, MODIFIED, REMOVED,
   RENAMED requirements) to the baseline in
   `openspec/specs/<capability>/spec.md`, creating it if needed, and it moves
   the change, `.openspec.yaml` included, to
   `openspec/changes/archive/YYYY-MM-DD-<name>/`.

   Never move the folder by hand. A plain `mv` archives the change but leaves
   its requirements out of `openspec/specs/`, so the baseline, third in
   CLAUDE.md's source-of-truth order, stops describing what the product does.
   `mkdir -p` and `mv` are not portable either.

6. **Check what the move left behind**

   - Run `pnpm run spec:validate --specs` for the baseline it wrote. Read the
     new or changed spec once: a blank line may be missing around a heading.
   - Search the repository for `openspec/changes/<name>/` and point each hit at
     the archived folder. Prose paths are not links, so nothing else finds them.
   - Stage the move (`git add -A openspec`) **before** running
     `pnpm run check:links`. It reads the file list from git's index, and it
     fails with `ENOENT` on a moved file that is still unstaged.

7. **Display summary**

   Show archive completion summary including:
   - Change name
   - Archive location
   - Baseline specs created or updated, with their requirement counts
   - Whether the ticked tasks were verified, checked now, or archived unverified
   - Any warnings (incomplete artifacts/tasks)

**Guardrails**
- Always prompt for change selection if not provided
- Use `pnpm run spec:status` for completion checking
- Run OpenSpec through the `spec:*` npm scripts.
- Don't block archive on warnings - just inform and confirm
- **Verification is offered, never required.** Skipping it is a valid answer
  and is reported in the summary, not argued with.
- Archive only through `pnpm run spec:archive`, which syncs the baseline specs
  and keeps `.openspec.yaml`. Never move the change folder by hand
