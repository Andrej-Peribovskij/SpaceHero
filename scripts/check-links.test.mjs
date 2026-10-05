import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brokenLinks, isExternal, markdownFiles, pathPart } from "./check-links.mjs";

function git(cwd, ...args) {
  const r = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
}

function write(root, file, text) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

/** A repository with two committed docs that link to each other, and a third that is gitignored. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), "check-links-"));
  git(root, "init", "-q");
  write(root, "README.md", "[guide](docs/guide.md)\n");
  write(root, "docs/guide.md", "[home](../README.md)\n");
  write(root, "docs/gone.md", "nothing to see\n");
  write(root, ".gitignore", "ignored/\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  write(root, "ignored/notes.md", "[nowhere](missing.md)\n");
  return root;
}

test("external and fragment-only targets have no path to resolve", () => {
  assert.equal(isExternal("https://example.com"), true);
  assert.equal(pathPart("#heading"), null);
  assert.equal(pathPart("mailto:a@b.c"), null);
  assert.equal(pathPart("docs/a%20b.md#x"), "docs/a b.md");
});

test("a clean tree lists the committed files and finds nothing broken", () => {
  const root = repo();
  try {
    const files = markdownFiles(root);
    assert.deepEqual(files.sort(), ["README.md", "docs/gone.md", "docs/guide.md"]);
    assert.deepEqual(brokenLinks(root, files), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unstaged move reports the links it broke instead of crashing", () => {
  const root = repo();
  try {
    mkdirSync(join(root, "docs/archive/2026"), { recursive: true });
    renameSync(join(root, "docs/guide.md"), join(root, "docs/archive/2026/guide.md"));

    const files = markdownFiles(root);
    assert.ok(!files.includes("docs/guide.md"), "the old path is skipped");
    assert.ok(files.includes("docs/archive/2026/guide.md"), "the new, untracked path is checked");

    assert.deepEqual(brokenLinks(root, files).sort(), [
      "README.md -> docs/guide.md",
      "docs/archive/2026/guide.md -> ../README.md",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unstaged delete is skipped, and ignored files are never read", () => {
  const root = repo();
  try {
    unlinkSync(join(root, "docs/gone.md"));
    const files = markdownFiles(root);
    assert.deepEqual(files.sort(), ["README.md", "docs/guide.md"]);
    assert.deepEqual(brokenLinks(root, files), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
