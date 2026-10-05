import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The checks themselves are tested in lib/links.test.mjs. This runs the entry
// point as CI does, so a guard that stops it from doing anything — and lets the
// gate exit 0 having checked nothing — fails here.
process.env.GIT_CONFIG_NOSYSTEM = "1";
process.env.GIT_CONFIG_GLOBAL = join(tmpdir(), "check-links-test-no-such-gitconfig");

/** A repository holding a copy of the entry point, its library, and one broken link. */
function repoWithBrokenLink() {
  const root = mkdtempSync(join(tmpdir(), "check-links-"));
  mkdirSync(join(root, "repo/scripts/lib"), { recursive: true });
  const repo = join(root, "repo");
  copyFileSync(join(import.meta.dirname, "check-links.mjs"), join(repo, "scripts/check-links.mjs"));
  copyFileSync(join(import.meta.dirname, "lib/links.mjs"), join(repo, "scripts/lib/links.mjs"));
  writeFileSync(join(repo, "README.md"), "[nowhere](missing.md)\n");
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: repo }).status, 0);
  return root;
}

function assertFailsOnTheLink(run) {
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /1 broken relative link\(s\)/);
  assert.match(run.stderr, /README\.md -> missing\.md/);
}

test("the entry point runs the check and fails on a broken link", () => {
  const root = repoWithBrokenLink();
  try {
    const repo = join(root, "repo");
    assertFailsOnTheLink(spawnSync(process.execPath, ["scripts/check-links.mjs"], { cwd: repo, encoding: "utf8" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("it still runs when reached through a link to the checkout", () => {
  // A junction on Windows (no privilege needed), a directory symlink elsewhere.
  // The path Node resolves for the module then differs from argv[1], which is
  // what silenced the earlier main-module guard.
  const root = repoWithBrokenLink();
  try {
    symlinkSync(join(root, "repo"), join(root, "link"), "junction");
    const script = join(root, "link", "scripts", "check-links.mjs");
    assertFailsOnTheLink(spawnSync(process.execPath, [script], { cwd: join(root, "link"), encoding: "utf8" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
