import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./git-hooks.mjs";

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
    const run = spawnSync(process.execPath, [join(import.meta.dirname, "git-hooks.mjs")], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() },
    });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /skipped/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
