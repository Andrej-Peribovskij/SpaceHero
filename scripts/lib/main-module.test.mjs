import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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
  const listed = spawnSync("git", ["ls-files", "*.mjs", "*.cjs", "*.js", "*.mts", "*.ts", "*.tsx"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(listed.status, 0, listed.stderr);
  const offenders = [];
  for (const file of listed.stdout.split("\n").filter(Boolean)) {
    let text;
    try {
      text = readFileSync(join(repoRoot, file), "utf8");
    } catch {
      continue; // deleted in the working tree, not yet staged
    }
    text.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\/?\*)/.test(line)) return; // a comment explaining the comparison is not one
      if (/import\.meta\.url/.test(line) && /process\.argv\[1\]/.test(line) && /[=!]==?/.test(line)) {
        offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});
