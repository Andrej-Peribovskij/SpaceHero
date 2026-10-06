import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, overrideNotice } from "./lib/git-hooks.mjs";
import { isolateGitConfig, linkToTree, withCopyOfScripts } from "./lib/test-support.mjs";

isolateGitConfig();

const SCRIPTS = ["git-hooks.mjs", "lib/git-hooks.mjs"];
const outsideAnyRepository = { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() };

function run(cwd, script, env = outsideAnyRepository) {
  return spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env });
}

/**
 * Fails before the script runs if git would find a repository from `dir`.
 * Otherwise a ceiling git normalised differently from the cwd would let the
 * script write `core.hooksPath` into whatever repository encloses the temp dir.
 */
function assertNoRepository(dir) {
  const probe = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", env: outsideAnyRepository });
  assert.notEqual(probe.status, 0, `git finds a repository from ${dir}: ${probe.stdout.trim()}; not running a script that would configure it`);
}

/** The shared config's `core.hooksPath`, or null when it is not set. */
function hooksPath(repo) {
  const read = spawnSync("git", ["config", "--local", "--get", "core.hooksPath"], { cwd: repo, encoding: "utf8" });
  if (read.status === 1) return null;
  assert.equal(read.status, 0, `git config failed in ${repo}: ${read.stderr}`);
  return read.stdout.trim();
}

test("installs inside a work tree", () => {
  assert.deepEqual(decide({ status: 0, stdout: "true\n" }), { install: true });
});

test("skips when git cannot be started, rather than failing the install", () => {
  const v = decide({ error: new Error("spawn git ENOENT"), status: null });
  assert.equal(v.install, false);
  assert.match(v.reason, /not runnable/);
});

test("skips outside a work tree", () => {
  assert.equal(decide({ status: 128, stdout: "" }).install, false);
  assert.equal(decide({ status: 0, stdout: "false\n" }).install, false);
});

test("says nothing more when git reads back .githooks", () => {
  assert.equal(overrideNotice({ status: 0, stdout: "file:.git/config\t.githooks\n" }), null);
});

test("names the value and where it comes from when another scope wins", () => {
  const notice = overrideNotice({ status: 0, stdout: "file:.git/config.worktree\tC:\\checkout\\.githooks\n" });
  assert.match(notice, /git uses C:\\checkout\\\.githooks from file:\.git\/config\.worktree/);
});

test("says nothing when the read-back itself fails", () => {
  assert.equal(overrideNotice({ error: new Error("spawn git ENOENT"), status: null }), null);
  assert.equal(overrideNotice({ status: 1, stdout: "" }), null);
});

test("the script exits 0 in a directory that is not a repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "git-hooks-"));
  try {
    assertNoRepository(dir);
    const result = run(dir, join(import.meta.dirname, "git-hooks.mjs"));
    assert.equal(result.status, 0);
    assert.match(result.stdout, /skipped/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the script points a repository at .githooks, quietly", () => {
  withCopyOfScripts({ prefix: "git-hooks-", files: SCRIPTS, repository: true }, (root) => {
    const tree = join(root, "tree");
    const result = run(tree, join(tree, "scripts/git-hooks.mjs"));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(hooksPath(tree), ".githooks");
  });
});

test("the script exits 0 and says why when git config cannot write", () => {
  withCopyOfScripts({ prefix: "git-hooks-", files: SCRIPTS, repository: true }, (root) => {
    const tree = join(root, "tree");
    writeFileSync(join(tree, ".git/config.lock"), ""); // what another git process holding the config leaves
    const result = run(tree, join(tree, "scripts/git-hooks.mjs"));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /git:hooks: skipped, git config failed: .*config/);
    assert.equal(hooksPath(tree), null);
  });
});

test("the script says so when a more specific setting overrides the one it wrote", () => {
  withCopyOfScripts({ prefix: "git-hooks-", files: SCRIPTS, repository: true }, (root) => {
    const tree = join(root, "tree");
    const env = {
      ...outsideAnyRepository,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: "elsewhere",
    };
    const result = run(tree, join(tree, "scripts/git-hooks.mjs"), env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /set core\.hooksPath to \.githooks, but git uses elsewhere/);
    assert.equal(hooksPath(tree), ".githooks");
  });
});

test("it still runs when reached through a link to the checkout", () => {
  // The path Node resolves for the module differs from argv[1] here, which is
  // what silenced the earlier main-module guard: it exited 0 having done nothing.
  withCopyOfScripts({ prefix: "git-hooks-", files: SCRIPTS, repository: true }, (root) => {
    const link = linkToTree(root);
    const result = run(link, join(link, "scripts/git-hooks.mjs"));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(hooksPath(join(root, "tree")), ".githooks");
  });
});

test("it still reports a skip when reached through a link outside a repository", () => {
  withCopyOfScripts({ prefix: "git-hooks-", files: SCRIPTS }, (root) => {
    const link = linkToTree(root);
    assertNoRepository(link);
    const result = run(link, join(link, "scripts/git-hooks.mjs"));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /git:hooks: skipped, not inside a git work tree/);
  });
});
