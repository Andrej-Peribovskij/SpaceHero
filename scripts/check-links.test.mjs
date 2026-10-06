import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isolateGitConfig, linkToTree, withCopyOfScripts } from "./lib/test-support.mjs";

// The checks themselves are tested in lib/links.test.mjs. This runs the entry
// point as CI does, so a guard that stops it from doing anything — and lets the
// gate exit 0 having checked nothing — fails here.
isolateGitConfig();

const SCRIPTS = ["check-links.mjs", "lib/links.mjs"];

/** A repository holding a copy of the entry point, its library, and one broken link. */
function withBrokenLink(body) {
  withCopyOfScripts({ prefix: "check-links-", files: SCRIPTS, repository: true }, (root) => {
    writeFileSync(join(root, "tree", "README.md"), "[nowhere](missing.md)\n");
    body(root);
  });
}

function assertFailsOnTheLink(run) {
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /1 broken relative link\(s\)/);
  assert.match(run.stderr, /README\.md -> missing\.md/);
}

test("the entry point runs the check and fails on a broken link", () => {
  withBrokenLink((root) => {
    const tree = join(root, "tree");
    assertFailsOnTheLink(spawnSync(process.execPath, ["scripts/check-links.mjs"], { cwd: tree, encoding: "utf8" }));
  });
});

test("it still runs when reached through a link to the checkout", () => {
  // The path Node resolves for the module then differs from argv[1], which is
  // what silenced the earlier main-module guard.
  withBrokenLink((root) => {
    const link = linkToTree(root);
    const script = join(link, "scripts", "check-links.mjs");
    assertFailsOnTheLink(spawnSync(process.execPath, [script], { cwd: link, encoding: "utf8" }));
  });
});
