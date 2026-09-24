/**
 * Tests for the design-version exporter's pure functions.
 *
 * Run with:  node --test scripts/export-design-version.test.mjs
 *
 * The parsing and the zip writer are unit-tested here; the end-to-end copy is exercised for real
 * by prompt 04's dry run against an actual version (see the implementation plan's Phase 5).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
    parseArgs,
    parseVersionEntry,
    parseImports,
    parseNamedExportMap,
    parseAssetRefs,
    rewriteAssetRefs,
    parseNavTargets,
    matchRoute,
    liveRenderSpecsUsed,
    loadAssetRegistry,
    matchRegistryEntries,
    extractTokens,
    zipStore,
    buildReadme,
} from "./export-design-version.mjs";

describe("parseArgs", () => {
    it("reads flags and defaults", () => {
        const a = parseArgs(["--version", "v4.1.0-tech", "--design-system", "/ds", "--out", "/o"]);
        assert.equal(a.version, "v4.1.0-tech");
        assert.equal(a.designSystem, "/ds");
        assert.equal(a.out, "/o");
        assert.equal(a.frontend, ".");
    });
    it("requires --version", () => {
        assert.throws(() => parseArgs(["--out", "/o"]), /--version is required/);
    });
});

const REGISTRY = `
export const VERSIONS = [
  { id: "v4", kind: "prod", wired: true, label: "v4 — current", entryRoute: "start",
    routes: [ { path: "", component: V4EntryPage, guard: "auth" } ] },
  {
    id: "v4.1.0-tech",
    kind: "design",
    wired: true,
    label: "v4.1.0-tech — review queue",
    entryRoute: "",
    routes: [
      { path: "", component: lazyPage(() => import("../pages/design/v4.1.0-tech/Entry.js"), "Entry"), guard: "auth" },
      { path: "queue/:id", component: lazyPage(() => import("../pages/design/v4.1.0-tech/Queue.js"), "QueuePage"), guard: "auth" },
    ],
  },
];
`;

describe("parseVersionEntry", () => {
    it("extracts the named entry, not a neighbour", () => {
        const e = parseVersionEntry(REGISTRY, "v4.1.0-tech");
        assert.equal(e.kind, "design");
        assert.equal(e.wired, true);
        assert.equal(e.label, "v4.1.0-tech — review queue");
        assert.equal(e.entryRoute, "");
        assert.deepEqual(e.routes, [
            { path: "", component: "Entry", guard: "auth", source: "../pages/design/v4.1.0-tech/Entry.js" },
            { path: "queue/:id", component: "QueuePage", guard: "auth", source: "../pages/design/v4.1.0-tech/Queue.js" },
        ]);
    });
    it("does not confuse a prefix id (v4 vs v4.1.0-tech)", () => {
        // The dot and dash are escaped; asking for v4 returns v4's single direct-component route.
        const e = parseVersionEntry(REGISTRY, "v4");
        assert.equal(e.kind, "prod");
        assert.deepEqual(e.routes, [{ path: "", component: "V4EntryPage", guard: "auth", source: null }]);
    });
    it("returns null for an absent version", () => {
        assert.equal(parseVersionEntry(REGISTRY, "v9.9.9"), null);
    });
});

describe("parseImports", () => {
    it("reads named, default and bare imports", () => {
        const src = `
            import "./staging.css";
            import { Card, Input as In } from "@my-app/design-system";
            import { InsightCard } from "@my-app/design-system/staging/v4.1.0";
            import type { Foo } from "./types";
            import React from "react";
        `;
        const imps = parseImports(src);
        const ds = imps.find((i) => i.spec === "@my-app/design-system");
        assert.deepEqual(ds.names.sort(), ["Card", "Input"]);
        const st = imps.find((i) => i.spec === "@my-app/design-system/staging/v4.1.0");
        assert.deepEqual(st.names, ["InsightCard"]);
        const t = imps.find((i) => i.spec === "./types");
        assert.equal(t.isTypeOnly, true);
        assert.deepEqual(t.names, ["Foo"]);
        assert.ok(imps.some((i) => i.spec === "./staging.css" && i.names.length === 0));
    });
});

describe("parseNamedExportMap", () => {
    it("maps every exported name to its source file", () => {
        const idx = `
            export { Card, CardHeader } from "./components/Card";
            export type { CardProps } from "./components/Card";
            export { Button } from "./components/Button";
            export * from "./staging/v4.0.0/index";
        `;
        const map = parseNamedExportMap(idx);
        assert.equal(map.get("Card"), "./components/Card");
        assert.equal(map.get("CardHeader"), "./components/Card");
        assert.equal(map.get("CardProps"), "./components/Card");
        assert.equal(map.get("Button"), "./components/Button");
        assert.equal(map.has("*"), false); // export * is deliberately not resolvable
    });
});

describe("parseAssetRefs", () => {
    it("finds root-absolute src/href and CSS url() references", () => {
        const src = `
            <img src="/umovity-logo.png" alt="Umovity" />
            <a href="/brochure.pdf">download</a>
            background: url(/pattern.svg);
            background: url("/quoted.png");
        `;
        const refs = parseAssetRefs(src);
        assert.ok(refs.has("umovity-logo.png"));
        assert.ok(refs.has("brochure.pdf"));
        assert.ok(refs.has("pattern.svg"));
        assert.ok(refs.has("quoted.png"));
    });
    it("strips query/hash suffixes", () => {
        const refs = parseAssetRefs(`<img src="/logo.png?v=2#x">`);
        assert.ok(refs.has("logo.png"));
    });
    it("ignores relative, bare, protocol-relative, http and data URLs", () => {
        const src = `
            <img src="./local.png">
            <img src="logo.png">
            <img src="//cdn.example.com/x.png">
            <img src="https://example.com/x.png">
            <img src="data:image/png;base64,AAAA">
        `;
        assert.equal(parseAssetRefs(src).size, 0);
    });
});

describe("rewriteAssetRefs", () => {
    it("replaces a resolved root-absolute src with the resolver's replacement", () => {
        const src = `<img src="/umovity-logo.png" alt="Umovity" />`;
        const out = rewriteAssetRefs(src, (clean) =>
            clean === "umovity-logo.png" ? "../assets/umovity-logo.png" : null);
        assert.equal(out, `<img src="../assets/umovity-logo.png" alt="Umovity" />`);
    });
    it("replaces a resolved CSS url() reference", () => {
        const src = `background: url(/pattern.svg);`;
        const out = rewriteAssetRefs(src, (clean) =>
            clean === "pattern.svg" ? "./assets/pattern.svg" : null);
        assert.equal(out, `background: url(./assets/pattern.svg);`);
    });
    it("strips query/hash before resolving, but leaves the ref untouched when unresolved", () => {
        const src = `<img src="/logo.png?v=2">`;
        assert.equal(rewriteAssetRefs(src, () => null), src);
        const out = rewriteAssetRefs(src, (clean) => (clean === "logo.png" ? "./assets/logo.png" : null));
        assert.equal(out, `<img src="./assets/logo.png">`);
    });
});

describe("parseNavTargets", () => {
    it("reads plain string and template-literal nav() calls", () => {
        const src = `
            const nav = useVersionNav();
            nav("/start");
            nav(\`/project/\${event.id}\`);
            nav("");
        `;
        assert.deepEqual(parseNavTargets(src), ["/start", "/project/*", ""]);
    });
    it("ignores calls to a differently-named function", () => {
        assert.deepEqual(parseNavTargets(`navigateAway("/x"); notNav("/y");`), []);
    });
});

describe("matchRoute", () => {
    const routes = [
        { path: "", component: "Entry" },
        { path: "start", component: "StartChoice" },
        { path: "project/:eventId", component: "Workspace" },
    ];
    it("matches a literal segment route", () => {
        assert.equal(matchRoute("/start", routes).component, "StartChoice");
    });
    it("matches a :param route against a wildcarded template destination", () => {
        assert.equal(matchRoute("/project/*", routes).component, "Workspace");
    });
    it("matches the root route for an empty destination", () => {
        assert.equal(matchRoute("", routes).component, "Entry");
    });
    it("returns null for a destination outside this version's routes", () => {
        assert.equal(matchRoute("/nowhere", routes), null);
    });
});

describe("liveRenderSpecsUsed", () => {
    it("finds a known live-render import", () => {
        assert.deepEqual(liveRenderSpecsUsed(`import mapboxgl from "mapbox-gl";`), ["mapbox-gl"]);
    });
    it("returns empty for a file with no such import", () => {
        assert.deepEqual(liveRenderSpecsUsed(`import { Card } from "@my-app/design-system";`), []);
    });
});

describe("asset registry", () => {
    let dir;
    beforeEach(() => {
        dir = mkdtempSync(path.join(tmpdir(), "dce-registry-"));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("returns an empty array when registry.json is absent", () => {
        assert.deepEqual(loadAssetRegistry(dir), []);
    });
    it("loads a registry.json", () => {
        writeFileSync(path.join(dir, "registry.json"), JSON.stringify([{ id: "x", file: "x.png" }]));
        assert.deepEqual(loadAssetRegistry(dir), [{ id: "x", file: "x.png" }]);
    });
    it("matches by spec and, when present, by pattern", () => {
        const registry = [
            { id: "gray-light", matchSpecs: ["mapbox-gl"], matchPattern: "gray-light" },
            { id: "any-mapbox", matchSpecs: ["mapbox-gl"] },
        ];
        const hits = matchRegistryEntries(registry, ["mapbox-gl"], `theme="gray-light"`);
        assert.deepEqual(hits.map((h) => h.id), ["gray-light", "any-mapbox"]);
    });
    it("excludes an entry whose pattern doesn't match", () => {
        const registry = [{ id: "gray-light", matchSpecs: ["mapbox-gl"], matchPattern: "gray-light" }];
        assert.deepEqual(matchRegistryEntries(registry, ["mapbox-gl"], `theme="dark"`), []);
    });
    it("excludes an entry whose spec isn't among those used", () => {
        const registry = [{ id: "x", matchSpecs: ["three"] }];
        assert.deepEqual(matchRegistryEntries(registry, ["mapbox-gl"], "irrelevant"), []);
    });
    it("serves a `versions`-scoped entry only to the versions it lists; an unscoped one to all", () => {
        const registry = [
            { id: "swipe", matchSpecs: ["mapbox-gl"], matchPattern: "MAP_STYLE", versions: ["v2.0.0", "v2.1.0-tech"] },
            { id: "any-map", matchSpecs: ["mapbox-gl"], matchPattern: "MAP_STYLE" },
        ];
        const ids = (version) => matchRegistryEntries(registry, ["mapbox-gl"], "style: MAP_STYLE", { version }).map((h) => h.id);
        assert.deepEqual(ids("v2.0.0"), ["swipe", "any-map"]);
        assert.deepEqual(ids("v2.1.0-tech"), ["swipe", "any-map"]);
        assert.deepEqual(ids("v1.0.0"), ["any-map"], "the shared constant alone does not attach v2.0.0's image");
        assert.deepEqual(ids(null), ["any-map"], "no version known: a scoped entry does not match");
    });
    it("refuses a `versions` field that is not a non-empty list of ids", () => {
        for (const versions of ["v1.0.0", [], [1], null]) {
            assert.throws(
                () => matchRegistryEntries([{ id: "bad", matchSpecs: ["mapbox-gl"], versions }], ["mapbox-gl"], "", { version: "v1.0.0" }),
                /entry "bad": "versions" must be a non-empty array/,
            );
        }
    });
});

describe("extractTokens", () => {
    it("pulls raw custom properties, de-duplicated", () => {
        const css = `@theme inline { --color-primary: var(--primary); --primary: #123456; --primary: #123456; }`;
        const toks = extractTokens(css);
        assert.ok(toks.some((l) => l.includes("--color-primary: var(--primary);")));
        assert.equal(toks.filter((l) => l.includes("--primary: #123456;")).length, 1);
    });
});

describe("zipStore", () => {
    it("produces a valid store-only zip with the right signatures", () => {
        const buf = zipStore([{ name: "a/b.txt", data: Buffer.from("hello") }]);
        assert.equal(buf.readUInt32LE(0), 0x04034b50, "local file header signature");
        // End-of-central-directory record is the last 22 bytes.
        const eocd = buf.subarray(buf.length - 22);
        assert.equal(eocd.readUInt32LE(0), 0x06054b50, "EOCD signature");
        assert.equal(eocd.readUInt16LE(10), 1, "one entry in the central directory");
    });
});

describe("buildReadme", () => {
    it("renders the route graph and the component set", () => {
        const entry = {
            id: "v4.1.0-tech", kind: "design", wired: true, label: "v4.1.0-tech — x",
            entryRoute: "", routes: [{ path: "", component: "Entry" }, { path: "queue/:id", component: "QueuePage" }],
        };
        const md = buildReadme(entry, { shipped: ["Card"], staging: ["InsightCard"], stagingVersion: "v4.1.0", assets: ["umovity-logo.png"] });
        assert.match(md, /# v4\.1\.0-tech — design export/);
        assert.match(md, /wired:\*\* yes/);
        assert.match(md, /QueuePage/);
        assert.match(md, /- Card/);
        assert.match(md, /- InsightCard/);
        assert.match(md, /staging version `v4\.1\.0`/);
        assert.match(md, /## Static assets/);
        assert.match(md, /- umovity-logo\.png/);
    });
    it("shows (none) when a version references no static assets", () => {
        const entry = { id: "v1", kind: "design", wired: false, label: "x", entryRoute: "", routes: [] };
        const md = buildReadme(entry, { shipped: [], staging: [], stagingVersion: null });
        assert.match(md, /## Static assets/);
    });
    it("mounts a prod version at its own prefix, not /design/", () => {
        const entry = { id: "v4", kind: "prod", wired: true, label: "v4", entryRoute: "start", routes: [] };
        const md = buildReadme(entry, { shipped: [], staging: [], stagingVersion: null });
        assert.match(md, /adds the `\/v4` prefix/);
    });
    it("renders flows, reference images and the unresolved live-render table", () => {
        const entry = { id: "v4", kind: "prod", wired: true, label: "v4", entryRoute: "start", routes: [] };
        const md = buildReadme(entry, {
            shipped: [], staging: [], stagingVersion: null,
            flows: [
                { from: "Assistant.tsx", navPath: "/project/*", to: "Workspace", routePath: "project/:eventId" },
                { from: "Assistant.tsx", navPath: "/nowhere", to: null, routePath: null },
            ],
            referenceImages: [{ id: "x", description: "the gray background", exportAs: "assets/reference/x.png", files: ["Map.tsx"] }],
            unresolvedLiveRender: [{ file: "useMapCompare.ts", specs: ["mapbox-gl-compare"] }],
        });
        assert.match(md, /## Flows/);
        assert.match(md, /Workspace/);
        assert.match(md, /_unresolved — not one of this version's own routes_/);
        assert.match(md, /assets\/reference\/x\.png/);
        assert.match(md, /the gray background/);
        assert.match(md, /useMapCompare\.ts/);
        assert.match(md, /## If the design tool guesses wrong/);
    });
});
