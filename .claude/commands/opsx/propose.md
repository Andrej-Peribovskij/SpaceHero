---
name: "OPSX: Propose"
description: Propose a product-value change - create it and generate all artifacts in one step
category: Workflow
tags: [workflow, artifacts, experimental]
---

Propose a product-value change - create the change and generate all artifacts in
one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- tasks.md (implementation steps)

When ready to implement, run /opsx:apply

---

**Input**: The argument after `/opsx:propose` is the change name (kebab-case), OR a description of what the user wants to build.

Use this command when the requested work delivers product value: user-facing
behavior, product capabilities, workflow changes, business rules, permissions,
data semantics, or anything a stakeholder would recognize as product behavior.
Do not use it for purely technical maintenance such as dependency or version
bumps, formatting-only changes, build-tool cleanup, or internal refactors that
do not change product behavior unless the user explicitly asks for a spec.

**Steps**

1. **If no input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" -> `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Ensure a feature branch exists** (BLOCKING -- do this before any artifact work)

   Follow @docs/delivery.md#branching to derive the branch name and to handle a dirty working tree.

   ```bash
   git rev-parse --abbrev-ref HEAD
   git status --porcelain
   ```

   - **Not on a matching feature branch:** `git checkout -b <type>/<scope>/<slug>`.
     If `<scope>` is ambiguous, use **AskUserQuestion** to confirm.
   - **Already on a matching feature branch:** announce it and proceed.

3. **Create the change directory**
   ```bash
   pnpm run spec:new "<name>"
   ```
   This creates a scaffolded change at `openspec/changes/<name>/` with `.openspec.yaml`.

4. **Get the artifact build order**
   ```bash
   pnpm run spec:status --change "<name>" --json
   ```
   Parse the JSON to get:
   - `applyRequires`: array of artifact IDs needed before implementation (e.g., `["tasks"]`)
   - `artifacts`: list of all artifacts with their status and dependencies

5. **Create artifacts in sequence until apply-ready**

   Use the **TodoWrite tool** to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each artifact that is `ready` (dependencies satisfied)**:
      - Get instructions:
        ```bash
        pnpm run spec:instructions <artifact-id> --change "<name>" --json
        ```
      - The instructions JSON includes:
        - `context`: Project background (constraints for you - do NOT include in output)
        - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
        - `template`: The structure to use for your output file
        - `instruction`: Schema-specific guidance for this artifact type
        - `outputPath`: Where to write the artifact
        - `dependencies`: Completed artifacts to read for context
      - Read any completed dependency files for context
      - Create the artifact file using `template` as the structure
      - Apply `context` and `rules` as constraints - but do NOT copy them into the file
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until all `applyRequires` artifacts are complete**
      - After creating each artifact, re-run `pnpm run spec:status --change "<name>" --json`
      - Check if every artifact ID in `applyRequires` has `status: "done"` in the artifacts array
      - Stop when all `applyRequires` artifacts are done

   c. **If an artifact requires user input** (unclear context):
      - Use **AskUserQuestion tool** to clarify
      - Then continue with creation

6. **Show final status**
   ```bash
   pnpm run spec:status --change "<name>"
   ```

**Output**

After completing all artifacts, summarize:
- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/opsx:apply` to start implementing."

**Artifact Creation Guidelines**

- Follow the `instruction` field from `pnpm run spec:instructions ...` for each artifact type
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output

**Guardrails**
- A feature branch MUST exist before any artifact is written. Rule: @docs/delivery.md#branching.
- This workflow is for product-value changes. Purely technical maintenance usually does not need OpenSpec.
- Run OpenSpec through the `spec:*` npm scripts. Do not call `openspec` or `./node_modules/.bin/openspec` directly.
- Create ALL artifacts needed for implementation (as defined by schema's `apply.requires`)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next

**Length budgets** (from `openspec/config.yaml`)

Keep artifacts tight. Long documents bury the decisions agents need.

- `proposal.md` -- target <= 40 lines. Why / What Changes / Capabilities / Impact. No tasks, no implementation detail.
- `spec.md` (each capability) -- target <= 80 lines. One scenario per requirement (success + the most likely failure). Add a `Code:` line pointing at the module path(s) the spec governs.
- `tasks.md` -- group by vertical slice (10-30 files touched or about 1000 to 3000 LOC), <= 30 task lines per slice. Quality gates (`build`, `lint`, `test`) appear once per slice, not per sub-section. If the change needs more, split into more slices rather than one long list.
- `design.md` -- only when the change has architectural tradeoffs, cross-module coordination, security, performance, or non-obvious implementation choices. Skip it otherwise.

If you find yourself writing past these budgets, the change is probably two changes -- stop and ask the user whether to split.
