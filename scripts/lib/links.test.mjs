import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brokenLinks, checkLinks, isExternal, markdownFiles, pathPart } from "./links.mjs";

// The throwaway repositories must not see the developer's git config: commit
// signing would prompt or fail, a global hooksPath would run hooks, and a
// global excludes file would change what --exclude-standard lists. A missing
// global file reads as empty. node --test runs each file in its own process,
// so this does not leak into other tests.
process.env.GIT_CONFIG_NOSYSTEM = "1";
process.env.GIT_CONFIG_GLOBAL = join(tmpdir(), "links-test-no-such-gitconfig");
process.env.GIT_CEILING_DIRECTORIES = tmpdir();

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
  const root = mkdtempSync(join(tmpdir(), "links-"));
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

function within(root, body) {
  try {
    body();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("external and fragment-only targets have no path to resolve", () => {
  assert.equal(isExternal("https://example.com"), true);
  assert.equal(pathPart("#heading"), null);
  assert.equal(pathPart("mailto:a@b.c"), null);
  assert.equal(pathPart("docs/a%20b.md#x"), "docs/a b.md");
});

test("a % that is not an escape is taken literally, not thrown on", () => {
  assert.equal(pathPart("50%-off.md"), "50%-off.md");
  const root = repo();
  within(root, () => {
    write(root, "50%-off.md", "sale\n");
    write(root, "deals.md", "[sale](50%-off.md) [gone](90%-off.md)\n");
    assert.deepEqual(brokenLinks(root, ["deals.md"]), ["deals.md -> 90%-off.md"]);
  });
});

test("a clean tree lists the committed files and finds nothing broken", () => {
  const root = repo();
  within(root, () => {
    const files = markdownFiles(root);
    assert.deepEqual(files.sort(), ["README.md", "docs/gone.md", "docs/guide.md"]);
    assert.deepEqual(brokenLinks(root, files), []);
  });
});

test("an unstaged move reports the links it broke instead of crashing", () => {
  const root = repo();
  within(root, () => {
    mkdirSync(join(root, "docs/archive/2026"), { recursive: true });
    renameSync(join(root, "docs/guide.md"), join(root, "docs/archive/2026/guide.md"));

    const files = markdownFiles(root);
    assert.ok(!files.includes("docs/guide.md"), "the old path is skipped");
    assert.ok(files.includes("docs/archive/2026/guide.md"), "the new, untracked path is checked");

    assert.deepEqual(brokenLinks(root, files).sort(), [
      "README.md -> docs/guide.md",
      "docs/archive/2026/guide.md -> ../README.md",
    ]);
  });
});

test("an unstaged delete is skipped, and ignored files are never read", () => {
  const root = repo();
  within(root, () => {
    unlinkSync(join(root, "docs/gone.md"));
    const files = markdownFiles(root);
    assert.deepEqual(files.sort(), ["README.md", "docs/guide.md"]);
    assert.deepEqual(brokenLinks(root, files), []);
  });
});

test("a tracked file turned into a directory is skipped, not read", () => {
  const root = repo();
  within(root, () => {
    unlinkSync(join(root, "docs/gone.md"));
    write(root, "docs/gone.md/inside.txt", "a directory now\n");
    assert.deepEqual(markdownFiles(root).sort(), ["README.md", "docs/guide.md"]);
  });
});

test("a non-ASCII name comes back unquoted and is checked", () => {
  const root = repo();
  within(root, () => {
    write(root, "docs/übersicht.md", "[nowhere](missing.md)\n");
    const files = markdownFiles(root);
    assert.ok(files.includes("docs/übersicht.md"));
    assert.deepEqual(brokenLinks(root, files), ["docs/übersicht.md -> missing.md"]);
  });
});

test("outside a repository the failure is one readable line and exit 1", () => {
  const root = mkdtempSync(join(tmpdir(), "links-"));
  within(root, () => {
    assert.throws(() => markdownFiles(root), /git ls-files failed/);

    const errors = [];
    const code = checkLinks(root, { log: () => {}, error: (m) => errors.push(m) });
    assert.equal(code, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^check:links: git ls-files failed/);
  });
});

test("a conflicted path is listed once, not once per stage", () => {
  const root = repo();
  within(root, () => {
    git(root, "checkout", "-q", "-b", "other");
    write(root, "README.md", "[guide](docs/guide.md) other\n");
    git(root, "commit", "-q", "-am", "other");
    git(root, "checkout", "-q", "-");
    write(root, "README.md", "[guide](docs/guide.md) mine\n");
    git(root, "commit", "-q", "-am", "mine");
    spawnSync("git", ["merge", "-q", "other"], { cwd: root, encoding: "utf8" });
    // A merge that failed for any other reason leaves no stages, and the
    // assertion below would pass without testing anything.
    const stages = spawnSync("git", ["ls-files", "-u", "--", "README.md"], { cwd: root, encoding: "utf8" });
    assert.equal(stages.stdout.trim().split("\n").length, 3, `README.md is in conflict: ${stages.stdout}`);

    assert.equal(markdownFiles(root).filter((f) => f === "README.md").length, 1);
  });
});

test("a file that cannot be read is reported, not thrown", () => {
  const root = repo();
  within(root, () => {
    // Listed, then gone before it is read: the race an editor's save can cause.
    assert.deepEqual(brokenLinks(root, ["README.md", "docs/vanished.md"]), [
      "docs/vanished.md (unreadable: ENOENT)",
    ]);
  });
});

test("a link starting with / resolves from the repository root", () => {
  const root = repo();
  within(root, () => {
    write(root, "docs/deep/page.md", "[guide](/docs/guide.md) [gone](/docs/nope.md)\n");
    assert.deepEqual(brokenLinks(root, ["docs/deep/page.md"]), ["docs/deep/page.md -> /docs/nope.md"]);
  });
});

test("broken links are listed and exit 1; a clean tree exits 0", () => {
  const root = repo();
  within(root, () => {
    const out = [];
    const sink = { log: (m) => out.push(m), error: (m) => out.push(m) };
    assert.equal(checkLinks(root, sink), 0);
    assert.match(out.join("\n"), /Checked 3 Markdown files/);

    out.length = 0;
    unlinkSync(join(root, "README.md"));
    assert.equal(checkLinks(root, sink), 1);
    assert.match(out.join("\n"), /docs\/guide\.md -> \.\.\/README\.md/);
  });
});
