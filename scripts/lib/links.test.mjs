import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brokenLinks, checkLinks, isExternal, markdownFiles, pathPart, withoutCode } from "./links.mjs";

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

/** The broken links in a single file `doc.md` holding `lines`, in a fresh repository. */
function brokenIn(lines, options) {
  const root = repo();
  try {
    write(root, "doc.md", [...lines, ""].join("\n"));
    return brokenLinks(root, ["doc.md"], options);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("links inside fenced code blocks are examples, not links", () => {
  assert.deepEqual(
    brokenIn([
      "```md",
      "[backtick](placeholder.md)",
      "```",
      "~~~",
      "[tilde](placeholder.md)",
      "~~~",
      "````md",
      "```",
      "[shorter fence inside](placeholder.md)",
      "```",
      "````",
      "~~~ info with a ` backtick is fine after tildes",
      "[tilde info](placeholder.md)",
      "~~~",
      "[after](missing.md)",
    ]),
    ["doc.md -> missing.md"],
  );
});

test("a fence nested in a list item sits deeper than three spaces and still counts", () => {
  // The shape of .claude/commands/opsx/propose.md: a fence at eight spaces.
  assert.deepEqual(
    brokenIn([
      "   a. **For each artifact**:",
      "      - Get instructions:",
      "        ```bash",
      "        see [the proposal](openspec/changes/<name>/proposal.md)",
      "        ```",
      "      - Then [this](missing.md)",
    ]),
    ["doc.md -> missing.md"],
  );
});

test("a fence closes only on the same character, at least as long, with nothing after", () => {
  // Each of these leaves the fence open, so the link stays inside it.
  for (const close of ["~~~", "``", "``` js"]) {
    assert.deepEqual(brokenIn(["```", close, "[inside](placeholder.md)", "```", "[after](missing.md)"]), [
      "doc.md -> missing.md",
    ]);
  }
  assert.deepEqual(brokenIn(["````", "```", "[inside](placeholder.md)", "````", "[after](missing.md)"]), [
    "doc.md -> missing.md",
  ]);
  // An unclosed fence runs to the end of the file.
  assert.deepEqual(brokenIn(["[before](missing.md)", "```", "[inside](placeholder.md)"]), ["doc.md -> missing.md"]);
});

test("a backtick fence whose info string holds a backtick is text, so links after it are checked", () => {
  assert.deepEqual(brokenIn(["``` not`a fence", "[real](missing.md)"]), ["doc.md -> missing.md"]);
});

test("links inside code spans are examples; an escaped backtick opens no span", () => {
  // Blanked to spaces of the same width, so `[a]`x`(b.md)` cannot join into a link.
  assert.equal(withoutCode("a `[x](y.md)` b"), `a ${" ".repeat("`[x](y.md)`".length)} b`);
  assert.deepEqual(brokenIn(["[a]`x`(missing.md)"]), []);
  assert.deepEqual(
    brokenIn([
      "Write `[see](openspec/changes/<slug>/proposal.md)` like this.",
      "Double: `` a ` [x](placeholder.md) `` and done.",
      "Escaped: \\`[escaped](missing-1.md)\\` is plain text.",
      "Unmatched: ``[run](missing-2.md)` has no partner of length two.",
      "Escaped backslash: \\\\`[in a span](placeholder.md)` is code.",
      "[`code` in the text](docs/guide.md) and [`code`](missing-3.md)",
    ]),
    ["doc.md -> missing-1.md", "doc.md -> missing-2.md", "doc.md -> missing-3.md"],
  );
});

test("a link whose case differs from the file is broken on every platform", () => {
  const broken = brokenIn(["[a](docs/Guide.md) [b](Docs/guide.md) [c](docs/guide.md) [d](docs/) [e](./README.md)"]);
  // Linux finds no such file; Windows and macOS find it and reject the case.
  assert.equal(broken.length, 2, broken.join("\n"));
  assert.match(broken[0], /^doc\.md -> docs\/Guide\.md( \(case differs from the file on disk\))?$/);
  assert.match(broken[1], /^doc\.md -> Docs\/guide\.md( \(case differs from the file on disk\))?$/);
});

test("a decomposed name from the file system is not a case error", () => {
  const root = repo();
  within(root, () => {
    const composed = "café.md";
    write(root, composed, "menu\n");
    write(root, "doc.md", `[menu](${composed})\n`);
    // macOS's HFS+ lists names decomposed whatever was written.
    const decomposing = (dir) => readdirSync(dir).map((name) => name.normalize("NFD"));
    assert.deepEqual(brokenLinks(root, ["doc.md"], { readdir: decomposing }), []);
  });
});

test("a directory that cannot be listed is reported, not thrown", () => {
  const root = repo();
  within(root, () => {
    write(root, "doc.md", "[guide](docs/guide.md) [home](README.md)\n");
    const locked = (dir) => {
      if (dir === join(root, "docs")) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      return readdirSync(dir);
    };
    assert.deepEqual(brokenLinks(root, ["doc.md"], { readdir: locked }), [
      "doc.md -> docs/guide.md (unreadable: EACCES)",
    ]);
  });
});

test("a protocol-relative target is external", () => {
  assert.equal(isExternal("//example.com/docs/guide.md"), true);
  assert.equal(pathPart("//example.com/docs/guide.md"), null);
  assert.equal(isExternal("/docs/guide.md"), false);
  assert.deepEqual(brokenIn(["[cdn](//example.com/missing.md) [root](/missing.md)"]), ["doc.md -> /missing.md"]);
});

test("reference-style definitions are checked like inline links", () => {
  assert.deepEqual(
    brokenIn([
      "See [the guide][guide] and [the other][other].",
      "",
      "[guide]: docs/guide.md",
      '   [other]: missing-1.md "three spaces is still a definition"',
      "[case]: Docs/guide.md",
      "[web]: https://example.com/missing.md",
      "[cdn]: //example.com/missing.md",
      "[anchor]: #heading",
      "[^note]: missing.md is a footnote's text, not a link",
      "    [indented]: missing.md is an indented code block",
      "Text before [mid]: missing.md is not a definition",
      "`[span]: missing.md`",
      "```",
      "[fenced]: missing.md",
      "```",
    ]).map((b) => b.replace(/ \(case differs from the file on disk\)$/, "")),
    ["doc.md -> missing-1.md", "doc.md -> Docs/guide.md"],
  );
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
