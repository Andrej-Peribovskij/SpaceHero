/**
 * Tests for scripts/ci-changed.mjs.
 *
 * The whole value of this script is that it fails safe: every path it does not
 * recognise has to count as code, because the cost of running the full gate on
 * a paragraph is four minutes and the cost of skipping it on a migration is a
 * broken main. So these tests are mostly about the paths that must NOT be
 * classified as documentation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classify, isDocsOnlyPath } from "./ci-changed.mjs";

describe("isDocsOnlyPath — prose", () => {
  for (const path of [
    "README.md",
    "CLAUDE.md",
    "docs/README.md",
    "docs/design-versioning.md",
    "docs/tech-debt/no-branch-protection-on-main.md",
    "openspec/config.yaml",
    "process/design/prompts/01-create-design-version.md",
    "process/design/templates/version-registry/frontend/registry.tsx",
    "design-commands/design-01-create.md",
  ]) {
    it(`skips the gate for ${path}`, () => assert.equal(isDocsOnlyPath(path), true));
  }
});

describe("isDocsOnlyPath — anything that can break a build", () => {
  for (const path of [
    "apps/web/src/app.tsx",
    "apps/web/package.json",
    "services/api/src/Program.cs",
    "packages/schemas/openapi/api-v1.json",
    "scripts/init.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".github/workflows/pr-checks.yml",
    "infra/compose/compose.yml",
    "tests/e2e/routing.spec.ts",
    ".npmrc",
    "tsconfig.base.json",
  ]) {
    it(`runs the gate for ${path}`, () => assert.equal(isDocsOnlyPath(path), false));
  }

  it("runs the gate for a script inside the process folder, because it has tests", () => {
    assert.equal(isDocsOnlyPath("process/design/scripts/export-design-version.mjs"), false);
    assert.equal(isDocsOnlyPath("process/design/scripts/export-design-version.test.mjs"), false);
  });

  it("runs the gate for a .mjs under docs/, which would be a script in a prose folder", () => {
    assert.equal(isDocsOnlyPath("docs/generated/build.mjs"), false);
  });
});

describe("classify", () => {
  it("skips the expensive job when everything changed is prose", () => {
    assert.deepEqual(classify(["docs/README.md", "CLAUDE.md"]), { code: false, docs: true });
  });

  it("runs everything when one code file is mixed in", () => {
    assert.deepEqual(classify(["docs/README.md", "apps/web/src/app.tsx"]), { code: true, docs: true });
  });

  it("runs everything, and no docs job, for a pure code change", () => {
    assert.deepEqual(classify(["services/api/src/Program.cs"]), { code: true, docs: false });
  });

  it("runs everything when the change set is empty", () => {
    // A run that proves nothing should look like a run, not like a pass.
    assert.deepEqual(classify([]), { code: true, docs: false });
  });

  it("ignores blank lines from the diff", () => {
    assert.deepEqual(classify(["docs/README.md", "", null]), { code: false, docs: true });
  });
});
