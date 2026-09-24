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
   mkdir -p openspec/changes/archive
   mv openspec/changes/<name> openspec/changes/archive/YYYY-MM-DD-<name>
   ```

6. **Display summary**

   Show archive completion summary including:
   - Change name
   - Archive location
   - Whether the ticked tasks were verified, checked now, or archived unverified
   - Any warnings (incomplete artifacts/tasks)

**Guardrails**
- Always prompt for change selection if not provided
- Use `pnpm run spec:status` for completion checking
- Run OpenSpec through the `spec:*` npm scripts.
- Don't block archive on warnings - just inform and confirm
- **Verification is offered, never required.** Skipping it is a valid answer
  and is reported in the summary, not argued with.
- Preserve .openspec.yaml when moving to archive
