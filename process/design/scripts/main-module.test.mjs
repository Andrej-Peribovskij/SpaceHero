/**
 * Tests for the run-directly check the exporter and the fixture scripts use.
 *
 * Run with:  node --test process/design/scripts/main-module.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isMainModule } from "./main-module.mjs";

const here = import.meta.dirname;
const self = path.join(here, "main-module.mjs");
const repositoryCopy = path.join(here, "../../../scripts/lib/main-module.mjs");

describe("isMainModule", () => {
    it("is true for the file Node was asked to run, false for one it imported", () => {
        assert.equal(isMainModule(pathToFileURL(self).href, self), true);
        assert.equal(isMainModule(pathToFileURL(self).href, path.join(here, "main-module.test.mjs")), false);
    });

    it("is false without an entry, or with one that does not exist", () => {
        assert.equal(isMainModule(pathToFileURL(self).href, undefined), false);
        assert.equal(isMainModule(pathToFileURL(self).href, path.join(here, "no-such-file.mjs")), false);
    });

    it("is true for a script reached through a link to its directory", () => {
        // A junction on Windows (no privilege needed), a directory symlink elsewhere.
        const root = mkdtempSync(path.join(tmpdir(), "design-main-module-"));
        try {
            const real = path.join(root, "real");
            mkdirSync(real);
            copyFileSync(self, path.join(real, "main-module.mjs"));
            writeFileSync(
                path.join(real, "probe.mjs"),
                'import { isMainModule } from "./main-module.mjs";\nconsole.log(isMainModule(import.meta.url));\n',
            );
            const link = path.join(root, "link");
            symlinkSync(real, link, "junction");
            const run = spawnSync(process.execPath, [path.join(link, "probe.mjs")], { cwd: link, encoding: "utf8" });
            assert.equal(run.status, 0, run.stdout + run.stderr);
            assert.equal(run.stdout.trim(), "true");
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it("is the same function as the repository's scripts/lib copy", { skip: !existsSync(repositoryCopy) && "no scripts/lib copy outside this repository" }, () => {
        // Two copies so that process/design/ stays self-contained; this keeps them from drifting.
        const body = (file) => readFileSync(file, "utf8").replace(/^[\s\S]*?export function/m, "export function").replace(/\s+/g, " ");
        assert.equal(body(self), body(repositoryCopy));
    });
});
