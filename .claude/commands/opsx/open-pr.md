---
name: "OPSX: Open PR"
description: Create a GitHub pull request against main using the repository template
category: Workflow
tags: [workflow, github, pull-request]
---

Create a GitHub pull request against `main` using `.github/pull_request_template.md`.

**Input**: Optionally specify a PR title after `/opsx:open-pr`. If omitted, derive a Conventional Commits title from the branch name, commits, and diff.

**Steps**

1. **Inspect branch and working tree**

   ```bash
   git branch --show-current
   git status --short
   git fetch origin main
   ```

   - If the current branch is `main`, stop and ask the user to create a feature branch.
   - If there are uncommitted changes, stop and ask whether to commit, stash, or create the PR from committed changes only.

2. **Check for an existing pull request**

   ```bash
   gh pr view --json url,baseRefName,headRefName,state
   ```

   - If an open PR already exists for this branch, report its URL.

3. **Understand the PR contents**

   ```bash
   git log --oneline origin/main..HEAD
   git diff --stat origin/main...HEAD
   git diff origin/main...HEAD
   ```

   Analyze all commits and files changed since the branch diverged from `main`.

4. **Read the pull request template**

   Read `.github/pull_request_template.md` and use it as the exact structure for the PR body. Fill every section in English.

5. **Derive the PR title**

   Use a Conventional Commits title. If the provided title is not Conventional Commits style, ask before changing it.

6. **Push the branch if needed**

   ```bash
   git push -u origin HEAD
   ```

   Never force push.

7. **Create the pull request**

   ```bash
   gh pr create --base main --head "$(git branch --show-current)" --title "<title>" --body-file "<path-to-filled-template>"
   ```

8. **Report the result**

   Return: PR URL, title, base branch, any validation not run.

**Guardrails**

- Always create PRs against `main`.
- Always use `.github/pull_request_template.md`.
- Keep the PR title and body in English.
- Do not create duplicate open PRs for the same branch.
- Do not push with `--force`.
- Do not claim validation was run unless it actually completed.
