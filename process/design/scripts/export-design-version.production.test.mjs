/**
 * Tests for the exporter's production mode (prompt 04, "Export the production version") and for
 * the parsing it shares with the design mode.
 *
 * Run with:  node --test process/design/scripts/export-design-version.production.test.mjs
 *
 * Each defect the production mode was written to fix has a test named for it:
 *   (a) the registry parser walking back into a comment, and not telling prod from design
 *   (b) only ever reading pages/design/<v>/
 *   (c) flows matching only nav(), and counting doc-comment examples as calls
 *   (d) DS_REPO_PATH resolving wrongly from a linked git worktree
 *   (e) a wired version's mock data being left implicit
 * The end-to-end tests build a synthetic frontend and design system in a temp dir and read the
 * written zip back, so they need no install and no network.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    apiCallsIn,
    buildExportMap,
    findMainCheckout,
    importSpecs,
    isTestFile,
    loadFixtures,
    maskSource,
    mockDataSection,
    parseArgs,
    parseImportBindings,
    parseNavTargets,
    parseShellEntry,
    parseVersionEntries,
    parseVersionEntry,
    resolveDsImports,
    resolveDsRepoPath,
    runDesignExport,
    runProductionExport,
    walkImportGraph,
} from "./export-design-version.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const silent = () => {};

/** Write a tree of files: { "a/b.ts": "…" } under `root`. */
function tree(root, files) {
    for (const [rel, body] of Object.entries(files)) {
        const abs = path.join(root, ...rel.split("/"));
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, body);
    }
}

/** Read a store-only zip written by zipStore back into { name: Buffer }. */
function readZip(file) {
    const buf = readFileSync(file);
    const eocd = buf.length - 22;
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const out = {};
    for (let i = 0; i < count; i++) {
        const size = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extra = buf.readUInt16LE(p + 30);
        const comment = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
        const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        out[name] = buf.subarray(dataStart, dataStart + size);
        p += 46 + nameLen + extra + comment;
    }
    return out;
}

/** The zip's entries with the top-level "<name>/" folder stripped. */
function zipTree(file) {
    const entries = readZip(file);
    return Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.slice(k.indexOf("/") + 1), v]));
}

// ── maskSource ──────────────────────────────────────────────────────────────

describe("maskSource", () => {
    it("blanks comments, keeps strings, and preserves length and line breaks", () => {
        const src = `const a = "x"; // note {id}\n/* block\n { */ const b = 'y';`;
        const m = maskSource(src);
        assert.equal(m.length, src.length);
        assert.equal(m.split("\n").length, src.split("\n").length);
        assert.ok(!m.includes("{id}"));
        assert.ok(!m.includes("block"));
        assert.ok(m.includes(`"x"`) && m.includes(`'y'`));
    });
    it("does not read // inside a string as a comment", () => {
        const m = maskSource(`const u = "http://example.com"; nav("/next");`);
        assert.ok(m.includes(`nav("/next")`));
    });
    it("with strings: true, blanks literal contents so braces inside them do not count", () => {
        const m = maskSource(`label: "a {b} c", re = /["{]/g;`, { strings: true });
        assert.ok(!m.includes("{b}"));
        assert.ok(!m.slice(m.indexOf("re")).includes("{"));
    });
});

// ── (a) the registry parser ─────────────────────────────────────────────────

const TRICKY_REGISTRY = `
/**
 * Paths look like /design/{id}/… and every entry is { id, kind, routes }.
 *   component: lazyPage(() => import("../pages/design/v9/Nope.js"), "Nope")
 */
import { EntryPage } from "../pages/v2.0.0/EntryPage";
import { Workspace as WorkspacePage } from "../pages/v2.0.0/Workspace";

export const PROD_VERSIONS = [
  {
    // Served at /{id}/ for administrators — {id} is the version.
    id: "v2.0.0",
    kind: "prod",
    wired: true,
    label: "v2.0.0 — current {braces}",
    entryRoute: "",
    routes: [
      { path: "", component: EntryPage, guard: "session" },
      { path: "project/:id", component: WorkspacePage, guard: "session" },
    ],
  },
];

export const DESIGN_VERSIONS = [
  { id: "v2.0.0", kind: "design", wired: false, label: "v2.0.0 — design", entryRoute: "",
    routes: [{ path: "", component: lazyPage(() => import("../pages/design/v2.0.0/Entry.js"), "Entry"), guard: "role:admin" }] },
  { id: "v3.0.0", kind: "design", wired: false, label: "v3", entryRoute: "", routes: [] },
];
`;

describe("parseVersionEntry — defect (a)", () => {
    it("is not thrown off by a comment full of {id} above the entry", () => {
        const e = parseVersionEntry(TRICKY_REGISTRY, "v2.0.0", { kind: "prod" });
        assert.equal(e.kind, "prod");
        assert.equal(e.wired, true);
        assert.equal(e.label, "v2.0.0 — current {braces}");
        assert.deepEqual(e.routes.map((r) => [r.path, r.component, r.guard]), [
            ["", "EntryPage", "session"],
            ["project/:id", "WorkspacePage", "session"],
        ]);
    });
    it("tells a version's production entry from its design entry", () => {
        const d = parseVersionEntry(TRICKY_REGISTRY, "v2.0.0", { kind: "design" });
        assert.equal(d.kind, "design");
        assert.equal(d.wired, false);
        assert.deepEqual(d.routes, [{ path: "", component: "Entry", guard: "role:admin", source: "../pages/design/v2.0.0/Entry.js" }]);
    });
    it("prefers the production entry when no kind is asked for, as findVersion does", () => {
        assert.equal(parseVersionEntry(TRICKY_REGISTRY, "v2.0.0").kind, "prod");
    });
    it("returns null when the id exists only with the other kind", () => {
        assert.equal(parseVersionEntry(TRICKY_REGISTRY, "v3.0.0", { kind: "prod" }), null);
    });
    it("never reads a route out of a doc comment", () => {
        const all = parseVersionEntries(TRICKY_REGISTRY).flatMap((e) => e.routes.map((r) => r.component));
        assert.ok(!all.includes("Nope"));
    });
    it("reads this repository's own registry: v1.0.0 is production and serves WidgetsView", () => {
        const source = readFileSync(path.join(repoRoot, "apps", "web", "src", "versions", "registry.tsx"), "utf8");
        const e = parseVersionEntry(source, "v1.0.0", { kind: "prod" });
        assert.equal(e.wired, true);
        assert.deepEqual(e.routes.map((r) => r.component), ["WidgetsView"]);
        // Its doc comment shows `component: lazyPage(… "StartPage")`; that is not a route.
        assert.ok(!parseVersionEntries(source).some((x) => x.routes.some((r) => r.component === "StartPage")));
    });
});

describe("parseImportBindings", () => {
    it("maps local names to what they import, through `as`, defaults and inline `type`", () => {
        const b = parseImportBindings(`
            import { A as B, type C } from "./x";
            import D from "./y";
            import type { E } from "./z";
            // import { F } from "./commented";
        `);
        assert.deepEqual(b, [
            { local: "B", imported: "A", spec: "./x" },
            { local: "C", imported: "C", spec: "./x" },
            { local: "D", imported: "default", spec: "./y" },
        ]);
    });
});

// ── (c) flows ───────────────────────────────────────────────────────────────

describe("parseNavTargets — defect (c)", () => {
    it("reads navigate() as well as nav(), and <VersionLink to>", () => {
        const src = `
            nav("/start");
            navigate(\`/project/\${id}\`);
            <VersionLink to="/briefing">Brief</VersionLink>
            <VersionLink className="x" to={\`/run/\${r.id}\`}>Run</VersionLink>
        `;
        assert.deepEqual(parseNavTargets(src), ["/start", "/project/*", "/briefing", "/run/*"]);
    });
    it("does not count a doc-comment example as a call", () => {
        const src = `
            /**
             * Never write \`navigate("/v3/briefing")\` — nav("/briefing") instead.
             */
            // navigate("/v3/old");
            nav("/real");
        `;
        assert.deepEqual(parseNavTargets(src), ["/real"]);
    });
});

// ── the import graph ────────────────────────────────────────────────────────

describe("importSpecs", () => {
    it("reads imports, re-exports and dynamic imports, not commented ones", () => {
        const specs = importSpecs(`
            import "./a.css";
            import { x } from "./b";
            export { y } from "./c.js";
            export * from "./d";
            const L = lazy(() => import("./e"));
            // import "./nope";
        `);
        assert.deepEqual(specs.sort(), ["./a.css", "./b", "./c.js", "./d", "./e"]);
    });
    it("reads a stylesheet's @imports", () => {
        assert.deepEqual(importSpecs(`@import "./tokens.css";\n@import url("x.css");\n/* @import "./no.css"; */`, { css: true }), ["./tokens.css", "x.css"]);
    });
});

describe("isTestFile", () => {
    it("excludes tests, stories and test helpers, and nothing else", () => {
        for (const f of ["a/x.test.tsx", "a/x.spec.ts", "a/x.stories.tsx", "src/testing/msw.ts", "src/__tests__/a.ts", "src/__mocks__/a.ts"]) {
            assert.equal(isTestFile(f.split("/").join(path.sep)), true, f);
        }
        assert.equal(isTestFile(path.join("src", "views", "contest.tsx")), false);
    });
});

describe("walkImportGraph — defect (b)", () => {
    let root;
    before(() => {
        root = mkdtempSync(path.join(tmpdir(), "dce-graph-"));
        tree(root, {
            "src/pages/v1/Entry.tsx": `import { Button } from "@acme/ds";\nimport { Header } from "../../views/header";\nimport "./Entry.css";\nexport { z } from "./z.js";\nconst L = lazy(() => import("./Lazy"));\nimport { gone } from "../../../../outside/y";`,
            "src/pages/v1/Entry.css": `.a{}`,
            "src/pages/v1/z.ts": `export const z = 1;`,
            "src/pages/v1/Lazy.tsx": `import { fmt } from "../../utils/format";`,
            "src/pages/v1/Entry.test.tsx": `import { Entry } from "./Entry";`,
            "src/views/header.tsx": `import { mock } from "../testing/msw";\nexport const Header = 1;`,
            "src/testing/msw.ts": `export const mock = 1;`,
            "src/utils/format.ts": `export const fmt = 1;`,
            "src/utils/unused.ts": `export const u = 1;`,
        });
    });
    after(() => rmSync(root, { recursive: true, force: true }));

    it("walks across folders from the entry, keeping only what is reached, tests excluded", () => {
        const src = path.join(root, "src");
        const g = walkImportGraph([path.join(src, "pages", "v1", "Entry.tsx")], src);
        const rel = g.files.map((f) => path.relative(src, f).split(path.sep).join("/")).sort();
        assert.deepEqual(rel, ["pages/v1/Entry.css", "pages/v1/Entry.tsx", "pages/v1/Lazy.tsx", "pages/v1/z.ts", "utils/format.ts", "views/header.tsx"]);
        assert.deepEqual([...g.external.get("@acme/ds")], ["Button"]);
        assert.deepEqual(g.outside.map((o) => o.spec), ["../../../../outside/y"]);
    });
});

describe("buildExportMap and resolveDsImports", () => {
    let ds;
    before(() => {
        ds = mkdtempSync(path.join(tmpdir(), "dce-ds-"));
        tree(ds, {
            "src/index.ts": `export { Button } from "./components/Button";\nexport * from "./components/more";\nexport * from "./index";`,
            "src/components/Button/index.ts": `export * from "./Button";`,
            "src/components/Button/Button.tsx": `export const Button = 1;`,
            "src/components/more.ts": `export { Chip } from "./Chip";`,
            "src/components/Chip.tsx": `export const Chip = 1;`,
            "src/staging/index.ts": `export * from "./v1.0.0/index";`,
            "src/staging/v1.0.0/index.ts": `export { Card } from "./Card";`,
            "src/staging/v1.0.0/Card.tsx": `export const Card = 1;`,
        });
    });
    after(() => rmSync(ds, { recursive: true, force: true }));

    it("follows export * (cycle-safe), which a named-export parser alone cannot", () => {
        const dsSrc = path.join(ds, "src");
        const map = buildExportMap(path.join(dsSrc, "index.ts"), [dsSrc]);
        assert.equal(path.basename(map.get("Chip")), "Chip.tsx");
        assert.equal(path.basename(map.get("Button")), "index.ts");
    });
    it("resolves shipped, the bare staging alias and a versioned staging subpath", () => {
        const dsSrc = path.join(ds, "src");
        const r = resolveDsImports(new Map([
            ["@acme/ds", ["Button", "Missing"]],
            ["@acme/ds/staging", ["Card"]],
            ["@acme/ds/staging/v1.0.0", ["Card"]],
            ["@acme/ds/staging/v1.0.0.css", []],
            ["react", ["useState"]],
        ]), "@acme/ds", dsSrc);
        assert.deepEqual(r.shipped, ["Button", "Missing"]);
        assert.deepEqual(r.staging, ["Card"]);
        assert.equal(r.stagingVersion, "v1.0.0");
        assert.deepEqual(r.unresolved, ["Missing (@acme/ds)"]);
        assert.equal(r.entryFiles.length, 2);
    });
    it("with no source tree, names the components and resolves no file", () => {
        const r = resolveDsImports(new Map([["@acme/ds", ["Button"]]]), "@acme/ds", null);
        assert.deepEqual(r.shipped, ["Button"]);
        assert.deepEqual(r.entryFiles, []);
        assert.deepEqual(r.unresolved, []);
    });
});

describe("apiCallsIn", () => {
    it("lists literal paths passed to API-client-shaped calls, and nothing else", () => {
        const calls = apiCallsIn(`
            apiJson<Widget[]>("/widgets");
            apiClient(\`/projects/\${id}/members\`, { method: "POST" });
            fetch("/config.json");
            nav("/start");
            useQuery("/not-a-call");
            fetch("//cdn.example.com/x");
            // apiJson("/commented");
        `);
        assert.deepEqual(calls, ["/config.json", "/projects/{…}/members", "/widgets"]);
    });

    it("reads a path passed after plain leading arguments, and not after anything else", () => {
        const calls = apiCallsIn(`
            shareRequest(token!, "/shared-plan");
            shareRequest(this.token, \`/shared-plan/\${id}\`, { method: "POST" });
            signedRequest(auth?.realm, token, "/two-leading");
            signedRequest(a, b, c, "/three-leading");
            apiClient(makeUrl(), "/after-a-call");
            apiClient("GET", "/after-a-literal");
            apiClient({ auth }, "/after-an-object");
            nav(token, "/not-a-client");
        `);
        assert.deepEqual(calls, ["/shared-plan", "/shared-plan/{…}", "/two-leading"]);
    });
});

// ── (d) DS_REPO_PATH from a linked worktree ─────────────────────────────────

describe("resolveDsRepoPath — defect (d)", () => {
    let base;
    let main;
    let wt;
    before(() => {
        base = mkdtempSync(path.join(tmpdir(), "dce-wt-"));
        main = path.join(base, "checkouts", "app");
        wt = path.join(base, "elsewhere", "app-feature");
        // The main checkout, and the DS as ITS sibling.
        tree(base, {
            "checkouts/app/.git/HEAD": "ref: refs/heads/main\n",
            "checkouts/app/.git/worktrees/app-feature/commondir": "../..\n",
            "checkouts/app/apps/web/package.json": "{}",
            "checkouts/ds/package.json": `{"name":"@acme/ds"}`,
            "checkouts/ds/src/index.ts": "",
            // A linked worktree somewhere else entirely: .git is a FILE.
            "elsewhere/app-feature/.git": `gitdir: ${path.join(main, ".git", "worktrees", "app-feature")}\n`,
            "elsewhere/app-feature/apps/web/package.json": "{}",
        });
    });
    after(() => rmSync(base, { recursive: true, force: true }));

    it("finds the main checkout from a linked worktree, as git rev-parse --git-common-dir does", () => {
        const r = findMainCheckout(path.join(wt, "apps", "web"));
        assert.equal(r.worktreeRoot, wt);
        assert.equal(r.mainRoot, main);
    });
    it("reports an ordinary checkout as its own main checkout, and null outside a repository", () => {
        assert.deepEqual(findMainCheckout(main), { worktreeRoot: main, mainRoot: main });
        assert.equal(findMainCheckout(path.join(base, "checkouts", "ds")), null);
    });
    it("resolves a relative DS_REPO_PATH against the main checkout when the worktree has no such sibling", () => {
        const r = resolveDsRepoPath("../ds", { cwd: wt });
        assert.equal(r.root, path.join(base, "checkouts", "ds"));
        assert.deepEqual(r.tried, [path.join(base, "elsewhere", "ds"), path.join(base, "checkouts", "ds")]);
    });
    it("keeps the offset when run from below the worktree root", () => {
        const r = resolveDsRepoPath("../../../ds", { cwd: path.join(wt, "apps", "web") });
        assert.equal(r.root, path.join(base, "checkouts", "ds"));
    });
    it("prefers the path as given when it is already a source tree", () => {
        const r = resolveDsRepoPath("../ds", { cwd: main });
        assert.equal(r.root, path.join(base, "checkouts", "ds"));
        assert.equal(r.tried.length, 1);
    });
    it("fails with every candidate it tried when neither is a source tree", () => {
        const r = resolveDsRepoPath("../nope", { cwd: wt });
        assert.equal(r.root, null);
        assert.deepEqual(r.tried, [path.join(base, "elsewhere", "nope"), path.join(base, "checkouts", "nope")]);
    });
    it("does not reinterpret an absolute path", () => {
        const r = resolveDsRepoPath(path.join(base, "nope"), { cwd: wt });
        assert.equal(r.root, null);
        assert.equal(r.tried.length, 1);
    });
});

// ── (e) mock data for a wired version ───────────────────────────────────────

describe("mockDataSection — defect (e)", () => {
    const wired = { id: "v2.0.0", wired: true };
    it("says explicitly that there is none when the host binds no fixtures source", () => {
        const md = mockDataSection(wired, { state: "unbound" });
        assert.match(md, /wired: true/);
        assert.match(md, /None included, deliberately/);
        assert.match(md, /`FIXTURES_DIR` is `null`/);
    });
    it("names the capture command when a bound source holds nothing for this version", () => {
        const md = mockDataSection(wired, { state: "empty", fixturesLabel: "fx/v2.0.0" });
        assert.match(md, /None included/);
        assert.match(md, /`fx\/v2\.0\.0`/);
        assert.match(md, /FIXTURE_CAPTURE_CMD/);
    });
    it("repeats the host's curation notes verbatim when fixtures are included", () => {
        const md = mockDataSection(wired, {
            state: "included",
            fixtures: {
                index: { apiPrefix: "/api/v1", recordedAt: "2026-09-23", curated: { notes: ["project list: probes dropped (removes: development probes)"] } },
                entries: [{ resource: "/me", status: 200 }, { resource: "/broken", status: 503 }],
                missing: ["/gone"],
            },
        });
        assert.match(md, /2 API answer\(s\) recorded/);
        assert.match(md, /- project list: probes dropped \(removes: development probes\)/);
        assert.match(md, /`\/broken` \(503\)/);
        assert.match(md, /`\/gone`/);
        assert.match(md, /GET \/api\/v1<resource>/);
    });
    it("says a wired: false production entry carries its data in its source", () => {
        assert.match(mockDataSection({ id: "v1", wired: false }, { state: "unbound" }), /wired: false/);
    });
});

describe("loadFixtures", () => {
    it("returns null for a directory with no index.json, and lists missing files otherwise", () => {
        const dir = mkdtempSync(path.join(tmpdir(), "dce-fx-"));
        try {
            assert.equal(loadFixtures(dir), null);
            assert.equal(loadFixtures(null), null);
            tree(dir, {
                "index.json": JSON.stringify({ responses: { "/me": { status: 200, file: "me.json" }, "/gone": { status: 200, file: "gone.json" } } }),
                "me.json": "{}",
            });
            const f = loadFixtures(dir);
            assert.deepEqual(f.entries.map((e) => e.resource), ["/me"]);
            assert.deepEqual(f.missing, ["/gone"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

// ── arguments ───────────────────────────────────────────────────────────────

describe("parseArgs — the production mode", () => {
    it("reads --mode production, repeated --shell, --fixtures and --ds-package", () => {
        const a = parseArgs([
            "--mode", "production", "--version", "v1.0.0", "--ds-package", "@acme/ds",
            "--shell", "/login=src/views/login/login-view.tsx#LoginView", "--shell", "/register=src/views/register.tsx",
            "--fixtures", "fx/v1.0.0",
        ]);
        assert.equal(a.mode, "production");
        assert.equal(a.dsPackage, "@acme/ds");
        assert.equal(a.fixtures, "fx/v1.0.0");
        assert.deepEqual(a.shell, [
            { path: "/login", file: "src/views/login/login-view.tsx", component: "LoginView" },
            { path: "/register", file: "src/views/register.tsx", component: null },
        ]);
    });
    it("defaults to the design mode", () => {
        assert.equal(parseArgs(["--version", "v1"]).mode, "design");
    });
    it("rejects an unknown mode, a flag with no value, and production-only flags in design mode", () => {
        assert.throws(() => parseArgs(["--version", "v1", "--mode", "prod"]), /--mode must be one of/);
        assert.throws(() => parseArgs(["--version", "--mode"]), /--version needs a value/);
        assert.throws(() => parseArgs(["--version", "v1", "--fixtures", "x"]), /belong to --mode production/);
    });
    it("rejects a malformed shell entry", () => {
        assert.throws(() => parseShellEntry("login=src/x.tsx"), /--shell expects/);
        assert.throws(() => parseShellEntry("/login"), /--shell expects/);
    });
    it("names MSYS_NO_PATHCONV when Git Bash has turned the route into a Windows path", () => {
        for (const mangled of ["C:/Program Files/Git/login=src/views/login/login-view.tsx#LoginView", "D:\\msys64\\register=src/views/register.tsx"]) {
            assert.throws(() => parseShellEntry(mangled), /Git Bash \(MSYS\).*MSYS_NO_PATHCONV=1/);
        }
        // A malformed entry that is not a rewritten path keeps the plain message.
        assert.throws(() => parseShellEntry("login=C:/x.tsx"), (e) => /--shell expects/.test(e.message) && !/MSYS/.test(e.message));
    });
});

// ── end to end, on a synthetic frontend ─────────────────────────────────────

const PROD_REGISTRY = `
/**
 * Every entry is { id, kind }; a route is served at /{id}/… for administrators.
 */
import { lazy } from "react";
import { EntryPage } from "../pages/v2.0.0/EntryPage";

export const PROD_VERSIONS = [
  {
    // {id} below is the version, never a literal prefix in a page.
    id: "v2.0.0",
    kind: "prod",
    wired: true,
    label: "v2.0.0 — current",
    entryRoute: "",
    routes: [
      { path: "", component: EntryPage, guard: "session" },
      { path: "project/:id", component: lazyPage(() => import("../pages/v2.0.0/Workspace.js"), "Workspace"), guard: "session" },
    ],
  },
];
export const DESIGN_VERSIONS = [
  { id: "v2.0.0", kind: "design", wired: false, label: "design copy", entryRoute: "",
    routes: [{ path: "", component: lazyPage(() => import("../pages/design/v2.0.0/Entry.js"), "Entry"), guard: "role:admin" }] },
  { id: "v3.0.0", kind: "design", wired: false, label: "design only", entryRoute: "", routes: [] },
];
`;

function syntheticApp(base) {
    tree(base, {
        "web/src/versions/registry.tsx": PROD_REGISTRY,
        "web/src/main.tsx": `import { App } from "./app";\nimport "./styles/app.css";`,
        "web/src/app.tsx": `export const App = 1;`,
        "web/src/styles/app.css": `@import "./tokens.css";\n@import "@acme/ds/index.css";`,
        "web/src/styles/tokens.css": `:root { --app-accent: #f00; }`,
        "web/src/pages/v2.0.0/EntryPage.tsx": [
            `import { Button } from "@acme/ds";`,
            `import { Card } from "@acme/ds/staging";`,
            `import { Header } from "../../views/shared/header";`,
            `/** Never \`navigate("/v2.0.0/project/1")\` — nav() instead. */`,
            `export function EntryPage() { const nav = useVersionNav(); nav(\`/project/\${p.id}\`); navigate("/login"); nav("/nowhere"); return <Header />; }`,
        ].join("\n"),
        "web/src/pages/v2.0.0/Workspace.tsx": `import { apiClient } from "../../infra/http";\nexport const Workspace = () => apiClient(\`/projects/\${id}\`, { method: "PATCH" });`,
        "web/src/pages/v2.0.0/EntryPage.test.tsx": `import { EntryPage } from "./EntryPage";`,
        "web/src/pages/design/v2.0.0/Entry.tsx": `export const Entry = 1;`,
        "web/src/views/shared/header.tsx": `import { apiJson } from "../../infra/http";\nexport const Header = () => { apiJson<Me>("/me"); return <img src="/logo.png" />; };`,
        "web/src/views/login/login-view.tsx": `import { apiJson } from "../../infra/http";\nexport const LoginView = () => apiJson("/public-config");`,
        "web/src/infra/http.ts": `export const apiJson = 1; export const apiClient = 1;`,
        "web/public/logo.png": "PNG",
        "ds/package.json": JSON.stringify({ name: "@acme/design-system-real" }),
        "ds/src/index.ts": `export { Button } from "./components/Button";`,
        "ds/src/index.css": `:root { --color-primary: #123456; }`,
        "ds/src/tokens/space.css": `:root { --space-1: 4px; }`,
        "ds/src/components/Button/index.ts": `export * from "./Button";`,
        "ds/src/components/Button/Button.tsx": `import { cn } from "../../lib/cn";\nexport const Button = 1;`,
        "ds/src/components/Unused.tsx": `export const Unused = 1;`,
        "ds/src/lib/cn.ts": `export const cn = 1;`,
        "ds/src/staging/index.ts": `export * from "./v1.0.0/index";`,
        "ds/src/staging/v1.0.0/index.ts": `export { Card } from "./components/Card";`,
        "ds/src/staging/v1.0.0/components/Card.tsx": `export const Card = 1;`,
        "fx/v2.0.0/index.json": JSON.stringify({
            apiPrefix: "/api/v1",
            recordedAt: "2026-09-23T00:00:00.000Z",
            responses: {
                "/me": { status: 200, file: "me.json" },
                "/public-config": { status: 200, file: "public-config.json", curated: true },
            },
            curated: { notes: ["public config: the dev banner flag turned off (removes: a development-only flag)"] },
        }),
        "fx/v2.0.0/me.json": `{"name":"Tess"}`,
        "fx/v2.0.0/public-config.json": `{"publicUiVersion":"v2.0.0"}`,
    });
}

describe("runProductionExport — end to end", () => {
    let base;
    const args = (over = {}) => ({
        mode: "production", version: "v2.0.0", frontend: "web", designSystem: "ds", dsPackage: "@acme/ds",
        out: "out", assets: null, fixtures: "fx/v2.0.0", shell: [parseShellEntry("/login=src/views/login/login-view.tsx#LoginView")],
        ...over,
    });
    before(() => {
        base = mkdtempSync(path.join(tmpdir(), "dce-prod-"));
        syntheticApp(base);
    });
    after(() => rmSync(base, { recursive: true, force: true }));

    it("exports the production entry's graph at src-relative paths, never the design entry", () => {
        const r = runProductionExport(args(), { log: silent, cwd: base });
        assert.equal(path.basename(r.zipPath), "v2.0.0-production-export.zip");
        const z = zipTree(r.zipPath);
        for (const f of [
            "src/pages/v2.0.0/EntryPage.tsx", "src/pages/v2.0.0/Workspace.tsx", "src/views/shared/header.tsx",
            "src/views/login/login-view.tsx", "src/infra/http.ts", "src/styles/app.css", "src/styles/tokens.css",
        ]) assert.ok(z[f], `missing ${f}`);
        assert.ok(!z["src/pages/design/v2.0.0/Entry.tsx"], "the design entry's file must not be exported");
        assert.ok(!z["src/pages/v2.0.0/EntryPage.test.tsx"], "tests are excluded");
        assert.ok(!z["src/app.tsx"], "the app shell's router is not walked");
    });
    it("copies the design system from source, following export * and the bare staging alias", () => {
        const z = zipTree(runProductionExport(args(), { log: silent, cwd: base }).zipPath);
        for (const f of ["design-system/components/Button/Button.tsx", "design-system/lib/cn.ts", "design-system/staging/v1.0.0/components/Card.tsx", "design-system/index.ts", "design-system/staging/index.ts"]) {
            assert.ok(z[f], `missing ${f}`);
        }
        assert.ok(!z["design-system/components/Unused.tsx"]);
        const tokens = z["tokens/tokens.css"].toString();
        assert.match(tokens, /--color-primary: #123456;/);
        assert.match(tokens, /--space-1: 4px;/);
    });
    it("ships the recorded fixtures with a request table, and says what was curated", () => {
        const z = zipTree(runProductionExport(args(), { log: silent, cwd: base }).zipPath);
        assert.equal(z["data/api/me.json"].toString(), `{"name":"Tess"}`);
        const table = JSON.parse(z["data/mock-api.json"].toString());
        assert.deepEqual(table["GET /api/v1/me"], { status: 200, file: "api/me.json" });
        const readme = z["README.md"].toString();
        assert.match(readme, /# v2\.0\.0 — production export/);
        assert.match(readme, /public config: the dev banner flag turned off \(removes: a development-only flag\)/);
    });
    it("writes routes with reachable calls, shell screens, flows without the comment example, and re-points assets", () => {
        const z = zipTree(runProductionExport(args(), { log: silent, cwd: base }).zipPath);
        const readme = z["README.md"].toString();
        assert.match(readme, /\| `\(entry\)` \| EntryPage \| `src\/pages\/v2\.0\.0\/EntryPage\.tsx` \| session \| `\/me` \|/);
        assert.match(readme, /Workspace .*`\/projects\/\{…\}`/);
        assert.match(readme, /\| `\/login` \| LoginView \| `src\/views\/login\/login-view\.tsx` \| `\/public-config` \|/);
        assert.match(readme, /`\/project\/\*` \| `project\/:id` → Workspace/);
        assert.match(readme, /`\/login` \| `login` → LoginView/);
        assert.match(readme, /`\/nowhere` \| _not one of this version's routes/);
        assert.ok(!readme.includes("/v2.0.0/project/1"), "a doc-comment navigate() is not a flow");
        assert.ok(z["assets/logo.png"]);
        assert.match(z["src/views/shared/header.tsx"].toString(), /src="\.\.\/\.\.\/\.\.\/assets\/logo\.png"/);
    });
    it("says explicitly that there is no mock data when no fixtures source is bound", () => {
        const r = runProductionExport(args({ fixtures: null }), { log: silent, cwd: base });
        assert.equal(r.fixturesState, "unbound");
        const z = zipTree(r.zipPath);
        assert.ok(!Object.keys(z).some((k) => k.startsWith("data/")));
        assert.match(z["README.md"].toString(), /None included, deliberately/);
    });
    it("says so when a bound fixtures source holds nothing for the version", () => {
        mkdirSync(path.join(base, "fx", "empty"), { recursive: true });
        const r = runProductionExport(args({ fixtures: "fx/empty" }), { log: silent, cwd: base });
        assert.equal(r.fixturesState, "empty");
        assert.match(zipTree(r.zipPath)["README.md"].toString(), /holds no recorded answers for `v2\.0\.0`/);
    });
    it("falls back to the installed package — names and tokens, no sources — when no source tree exists", () => {
        tree(base, {
            "web/node_modules/@acme/ds/package.json": JSON.stringify({ name: "@acme/design-system-real", exports: { "./index.css": "./dist/index.css" } }),
            "web/node_modules/@acme/ds/dist/index.css": `:root{--color-primary:#999999;}`,
        });
        const r = runProductionExport(args({ designSystem: "no-such-ds" }), { log: silent, cwd: base });
        assert.equal(r.ds.mode, "installed");
        assert.deepEqual(r.ds.shipped, ["Button"]);
        const z = zipTree(r.zipPath);
        assert.ok(!Object.keys(z).some((k) => k.startsWith("design-system/")));
        assert.match(z["tokens/tokens.css"].toString(), /--color-primary: #999999;/);
        assert.match(z["README.md"].toString(), /\*\*not included\.\*\* No design-system source tree/);
        rmSync(path.join(base, "web", "node_modules"), { recursive: true, force: true });
    });
    it("attaches a `versions`-scoped reference image only to the versions it names", () => {
        const scoped = mkdtempSync(path.join(tmpdir(), "dce-prod-assets-"));
        try {
            syntheticApp(scoped);
            tree(scoped, {
                "web/src/views/shared/header.tsx": `import { SharedMap } from "./map";\nexport const Header = () => <SharedMap />;`,
                "web/src/views/shared/map.tsx": `import maplibregl from "maplibre-gl";\nimport { MAP_STYLE } from "./style";\nexport const SharedMap = () => new maplibregl.Map({ style: MAP_STYLE });`,
                "web/src/views/shared/style.ts": `export const MAP_STYLE = "light";`,
                "assets/other.png": "PNG",
                "assets/registry.json": JSON.stringify([
                    { id: "other-version-map", file: "other.png", exportAs: "reference/other.png", description: "another version's map", matchSpecs: ["maplibre-gl"], matchPattern: "MAP_STYLE", versions: ["v1.0.0"] },
                ]),
            });
            const otherVersion = runProductionExport(args({ assets: "assets" }), { log: silent, cwd: scoped });
            assert.deepEqual(otherVersion.referenceImages, [], "v1.0.0's image does not attach to v2.0.0's map");
            assert.deepEqual(otherVersion.unresolvedLiveRender.map((u) => u.file), ["src/views/shared/map.tsx"], "the map is reported as missing a picture instead");
            assert.ok(!zipTree(otherVersion.zipPath)["reference/other.png"]);

            tree(scoped, {
                "assets/registry.json": JSON.stringify([
                    { id: "this-version-map", file: "other.png", exportAs: "reference/map.png", description: "v2.0.0's map", matchSpecs: ["maplibre-gl"], matchPattern: "MAP_STYLE", versions: ["v2.0.0"] },
                ]),
            });
            const r = runProductionExport(args({ assets: "assets" }), { log: silent, cwd: scoped });
            assert.deepEqual(r.referenceImages.map((i) => i.id), ["this-version-map"]);
            assert.ok(zipTree(r.zipPath)["reference/map.png"]);
        } finally {
            rmSync(scoped, { recursive: true, force: true });
        }
    });
    it("refuses a version with no production entry, naming the ones there are", () => {
        assert.throws(() => runProductionExport(args({ version: "v3.0.0" }), { log: silent, cwd: base }),
            /v3\.0\.0 has no production entry .*\(production ids: v2\.0\.0\)/);
    });
    it("refuses when neither a source tree nor an installed package is available", () => {
        assert.throws(() => runProductionExport(args({ designSystem: "no-such-ds" }), { log: silent, cwd: base }),
            /not a design-system SOURCE tree[\s\S]*not installed/);
    });
    it("refuses a shell entry that is not a file under src/", () => {
        assert.throws(() => runProductionExport(args({ shell: [parseShellEntry("/login=src/views/nope.tsx")] }), { log: silent, cwd: base }),
            /--shell \/login: src\/views\/nope\.tsx is not a file/);
    });
    it("refuses a route whose component it cannot locate", () => {
        const broken = PROD_REGISTRY.replace(`import { EntryPage } from "../pages/v2.0.0/EntryPage";`, "");
        tree(base, { "web2/src/versions/registry.tsx": broken, "web2/src/pages/v2.0.0/Workspace.tsx": "" });
        assert.throws(() => runProductionExport(args({ frontend: "web2" }), { log: silent, cwd: base }),
            /could not locate the source of route component\(s\): EntryPage/);
    });
});

describe("runDesignExport — the design mode still works, and reads the design entry", () => {
    let base;
    before(() => {
        base = mkdtempSync(path.join(tmpdir(), "dce-design-"));
        syntheticApp(base);
        tree(base, {
            "web/src/pages/design/v2.0.0/Entry.tsx": `import { Button } from "@acme/ds";\n// nav("/commented")\nexport const Entry = () => nav("/");`,
            "web/src/pages/design/v2.0.0/data/mock.ts": `export const mock = 1;`,
        });
    });
    after(() => rmSync(base, { recursive: true, force: true }));

    it("exports the version folder, resolving the DS through its alias and export *", () => {
        const r = runDesignExport({ mode: "design", version: "v2.0.0", frontend: "web", designSystem: "ds", dsPackage: "@acme/ds", out: "out", assets: null }, { log: silent, cwd: base });
        assert.equal(r.entry.kind, "design");
        assert.deepEqual(r.flows.map((f) => f.navPath), ["/"]); // the commented nav() is not a flow
        const z = zipTree(r.zipPath);
        assert.ok(z["screens/Entry.tsx"]);
        assert.ok(z["data/mock.ts"]);
        assert.ok(z["design-system/components/Button/Button.tsx"]);
        assert.match(z["README.md"].toString(), /wired:\*\* no/);
    });
    it("still requires a source tree, and says where it looked", () => {
        assert.throws(
            () => runDesignExport({ mode: "design", version: "v2.0.0", frontend: "web", designSystem: "nope", dsPackage: null, out: "out", assets: null }, { log: silent, cwd: base }),
            /not a design-system SOURCE tree[\s\S]*nope[\s\S]*cannot serve a design export/,
        );
    });
});

// ── this repository's own app ───────────────────────────────────────────────
//
// Runs only where the design system can be resolved — its source tree beside the checkout, or the
// installed package after `pnpm install`. CI's `test:design-process` runs without an install, and
// there it skips rather than failing on an absence that is not a defect.

describe("runProductionExport — this repository's apps/web", () => {
    const web = path.join(repoRoot, "apps", "web");
    const dsRepo = resolveDsRepoPath("../design-system-uds", { cwd: repoRoot }).root;
    const installed = existsSync(path.join(web, "node_modules", "@my-app", "design-system", "package.json"));
    const skip = dsRepo || installed ? false : "no design-system source tree and no install";

    it("exports v1.0.0: WidgetsView and what it reaches, and says it carries no mock data", { skip }, () => {
        const out = mkdtempSync(path.join(tmpdir(), "dce-self-"));
        try {
            const r = runProductionExport({
                mode: "production", version: "v1.0.0", frontend: "apps/web", designSystem: "../design-system-uds",
                dsPackage: "@my-app/design-system", out, assets: "design-commands/assets", fixtures: null, shell: [],
            }, { log: silent, cwd: repoRoot });
            const z = zipTree(r.zipPath);
            assert.ok(z["src/views/widgets/widgets-view.tsx"]);
            assert.ok(z["src/infra/http/client.ts"]);
            assert.ok(!z["src/views/widgets/widgets-view.test.tsx"]);
            assert.ok(r.ds.shipped.includes("Button"));
            const readme = z["README.md"].toString();
            assert.match(readme, /`\/widgets`/);
            assert.match(readme, /`FIXTURES_DIR` is `null`/);
        } finally {
            rmSync(out, { recursive: true, force: true });
        }
    });
});
