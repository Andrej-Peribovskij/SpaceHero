import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainModule } from "./main-module.mjs";
import { linkToTree, withCopyOfScripts } from "./test-support.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const self = join(import.meta.dirname, "main-module.mjs");

test("a module is the main one when Node was asked to run it", () => {
  assert.equal(isMainModule(pathToFileURL(self).href, self), true);
});

test("a module imported by another is not", () => {
  assert.equal(isMainModule(pathToFileURL(self).href, join(import.meta.dirname, "main-module.test.mjs")), false);
});

test("nothing is the main module without an entry, or with one that does not exist", () => {
  assert.equal(isMainModule(pathToFileURL(self).href, undefined), false);
  assert.equal(isMainModule(pathToFileURL(self).href, join(import.meta.dirname, "no-such-file.mjs")), false);
});

/** realpathSync.native failing as it does on some virtual volumes. */
function nativeRealpathFails(t) {
  t.mock.method(realpathSync, "native", () => {
    throw Object.assign(new Error("EISDIR: illegal operation on a directory"), { code: "EISDIR" });
  });
}

test("a failing native realpath falls back rather than answering no", (t) => {
  nativeRealpathFails(t);
  const warn = t.mock.method(console, "warn", () => {});
  assert.equal(isMainModule(pathToFileURL(self).href, self), true);
  assert.equal(warn.mock.callCount(), 0);
});

test("a failing native realpath that still leaves no is said, not swallowed", (t) => {
  nativeRealpathFails(t);
  const warn = t.mock.method(console, "warn", () => {});
  assert.equal(isMainModule(pathToFileURL(self).href, join(import.meta.dirname, "main-module.test.mjs")), false);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /could not resolve .*EISDIR.*main was skipped/);
});

/** Runs a probe script that prints what the helper says about it, from `cwd`, by `scriptPath`. */
function probe(cwd, scriptPath) {
  const run = spawnSync(process.execPath, [scriptPath], { cwd, encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return run.stdout.trim();
}

const PROBE = 'import { isMainModule } from "./lib/main-module.mjs";\nconsole.log(isMainModule(import.meta.url));\n';

test("a script run directly knows it", () => {
  withCopyOfScripts({ prefix: "main-module-", files: ["lib/main-module.mjs"] }, (root) => {
    const tree = join(root, "tree");
    writeFileSync(join(tree, "scripts/probe.mjs"), PROBE);
    assert.equal(probe(tree, join(tree, "scripts/probe.mjs")), "true");
    assert.equal(probe(join(tree, "scripts"), "probe.mjs"), "true");
  });
});

test("a script reached through a link to the checkout still knows it", () => {
  // Node resolves the module to the link's target and leaves argv[1] as typed:
  // the comparison this helper replaces was false here.
  withCopyOfScripts({ prefix: "main-module-", files: ["lib/main-module.mjs"] }, (root) => {
    writeFileSync(join(root, "tree/scripts/probe.mjs"), PROBE);
    const link = linkToTree(root);
    assert.equal(probe(link, join(link, "scripts/probe.mjs")), "true");
  });
});

test("no script compares import.meta.url with process.argv[1] directly", () => {
  // That comparison is false through a link, and a script guarded by it exits 0
  // having done nothing. Use isMainModule, or an unconditional entry point.
  // -z, or a non-ASCII path comes back quoted and cannot be read.
  // --others: a new script fails here before it is committed, not after.
  const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.mjs", "*.cjs", "*.js", "*.mts", "*.ts", "*.tsx"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(listed.status, 0, listed.stderr);
  const offenders = [];
  for (const file of listed.stdout.split("\0").filter(Boolean)) {
    let text;
    try {
      text = readFileSync(join(repoRoot, file), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue; // deleted in the working tree, not yet staged
      throw error;
    }
    for (const offence of bareGuards(text)) offenders.push(`${file}:${offence}`);
  }
  assert.deepEqual(offenders, []);
});

/**
 * `line: code` for each comparison against `process.argv[1]` in a file that
 * reads its own path (`import.meta.url` or `import.meta.filename`), on one
 * line or split across several — directly, or through a variable assigned from
 * it. Comment lines are skipped: a comment explaining the comparison is not one.
 */
function bareGuards(text) {
  const code = text.split("\n").map((line) => (/^\s*(\/\/|\/?\*)/.test(line) ? "" : line));
  if (!code.some((line) => /import\.meta\.(url|filename)/.test(line))) return [];

  const aliases = [];
  for (const line of code) {
    const m = /\b(?:const|let|var)\s+(\w+)\s*=.*process\.argv\[1\]/.exec(line);
    if (m) aliases.push(m[1]);
  }
  const entry = new RegExp(`process\\.argv\\[1\\]${aliases.map((a) => `|\\b${a}\\b`).join("")}`);
  const offences = [];
  code.forEach((line, i) => {
    if (/[=!]==?/.test(line.replace(/\b(?:const|let|var)\s+\w+\s*=/, "")) && entry.test(line)) {
      offences.push(`${i + 1}: ${line.trim()}`);
    }
  });
  return offences;
}

test("the guard scan catches the comparison however it is written", () => {
  // Assembled, so the scan of this file does not find its own fixtures.
  const ARGV = "process.argv" + "[1]";
  const URL = "import.meta" + ".url";
  const self = `const self = fileURLToPath(${URL});\n`;
  assert.equal(bareGuards(`if (${ARGV} === fileURLToPath(${URL})) main();\n`).length, 1);
  assert.equal(bareGuards(`${self}if (${ARGV} === self) main();\n`).length, 1);
  assert.equal(bareGuards(`${self}const entry = ${ARGV};\nif (entry !== self) process.exit(0);\n`).length, 1);
  assert.equal(bareGuards(`if (${"import.meta" + ".filename"} === ${ARGV}) main();\n`).length, 1);
  // Not a guard: no comparison, a comment, or a file that never reads its own URL.
  assert.deepEqual(bareGuards(`${self}const entry = ${ARGV};\n`), []);
  assert.deepEqual(bareGuards(`${self}// ${ARGV} === self is wrong through a link\n`), []);
  assert.deepEqual(bareGuards(`if (${ARGV} === 'x') main();\n`), []);
});
