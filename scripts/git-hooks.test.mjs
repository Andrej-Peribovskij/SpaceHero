import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./lib/git-hooks.mjs";

// The entry-point tests write git config into throwaway repositories; keep the
// developer's own system and global config out of them.
process.env.GIT_CONFIG_NOSYSTEM = "1";
process.env.GIT_CONFIG_GLOBAL = join(tmpdir(), "git-hooks-test-no-such-gitconfig");

/** A directory holding a copy of the entry point and its library, a git repository when asked. */
function copyOfTheScripts({ repository }) {
  const root = mkdtempSync(join(tmpdir(), "git-hooks-"));
  const tree = join(root, "tree");
  mkdirSync(join(tree, "scripts/lib"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "git-hooks.mjs"), join(tree, "scripts/git-hooks.mjs"));
  copyFileSync(join(import.meta.dirname, "lib/git-hooks.mjs"), join(tree, "scripts/lib/git-hooks.mjs"));
  if (repository) assert.equal(spawnSync("git", ["init", "-q"], { cwd: tree }).status, 0);
  return root;
}

function run(cwd, script) {
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() },
  });
}

function hooksPath(repo) {
  return spawnSync("git", ["config", "core.hooksPath"], { cwd: repo, encoding: "utf8" }).stdout.trim();
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

test("the script exits 0 in a directory that is not a repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "git-hooks-"));
  try {
    const result = run(dir, join(import.meta.dirname, "git-hooks.mjs"));
    assert.equal(result.status, 0);
    assert.match(result.stdout, /skipped/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the script points a repository at .githooks", () => {
  const root = copyOfTheScripts({ repository: true });
  try {
    const tree = join(root, "tree");
    const result = run(tree, join(tree, "scripts/git-hooks.mjs"));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(hooksPath(tree), ".githooks");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("it still runs when reached through a link to the checkout", () => {
  // A junction on Windows (no privilege needed), a directory symlink elsewhere.
  // The path Node resolves for the module then differs from argv[1], which is
  // what silenced the earlier main-module guard: it exited 0 having done nothing.
  const root = copyOfTheScripts({ repository: true });
  try {
    const link = join(root, "link");
    symlinkSync(join(root, "tree"), link, "junction");
    const result = run(link, join(link, "scripts/git-hooks.mjs"));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(hooksPath(join(root, "tree")), ".githooks");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("it still reports a skip when reached through a link outside a repository", () => {
  const root = copyOfTheScripts({ repository: false });
  try {
    const link = join(root, "link");
    symlinkSync(join(root, "tree"), link, "junction");
    const result = run(link, join(link, "scripts/git-hooks.mjs"));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /git:hooks: skipped, not inside a git work tree/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
