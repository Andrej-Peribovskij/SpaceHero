/**
 * Tests for the generic fixture runners: capture-fixtures.mjs (GET-only recording from a local
 * stack) and curate-fixtures.mjs (declared, contract-checked edits).
 *
 * Run with:  node --test process/design/scripts/fixtures.test.mjs
 *
 * The capture tests stand up a real HTTP server on loopback and record from it, so what is
 * asserted about methods and headers is what actually went over the wire.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
    MAX_NAME,
    RECORDED_NUMBERS_FILE,
    captureFixtures,
    fixtureName,
    isLoopback,
    parseCaptureArgs,
} from "./capture-fixtures.mjs";
import { curateFixtures, numbersIn, parseCurateArgs, validateEdits } from "./curate-fixtures.mjs";
import { loadFixtures } from "./export-design-version.mjs";

const silent = () => {};
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));

describe("fixtureName", () => {
    it("turns a resource path into a readable file name", () => {
        assert.equal(fixtureName("/projects/42/members"), "projects__42__members.json");
        assert.equal(fixtureName("/threads?includeResolved=true"), "threads_includeResolved_true.json");
    });
    it("caps long names with a hash, so two long paths stay distinct", () => {
        const a = fixtureName(`/models/1/comparisons?${"scenarioIds=0123456789abcdef&".repeat(6)}a`);
        const b = fixtureName(`/models/1/comparisons?${"scenarioIds=0123456789abcdef&".repeat(6)}b`);
        assert.ok(a.length <= MAX_NAME, a);
        assert.notEqual(a, b);
        assert.match(a, /~[0-9a-f]{10}\.json$/);
    });
});

describe("isLoopback", () => {
    it("accepts this machine and nothing else", () => {
        for (const u of ["http://localhost:3000", "http://127.0.0.1:1", "http://[::1]:3000", "http://api.localhost"]) assert.equal(isLoopback(u), true, u);
        for (const u of ["https://api.example.com", "http://10.0.0.2", "not a url", ""]) assert.equal(isLoopback(u), false, u);
    });
});

describe("parseCaptureArgs / parseCurateArgs", () => {
    it("require their inputs", () => {
        assert.throws(() => parseCaptureArgs(["--out", "x"]), /--plan/);
        assert.throws(() => parseCaptureArgs(["--plan", "p.mjs"]), /--out/);
        assert.throws(() => parseCaptureArgs(["--plan"]), /needs a value/);
        assert.throws(() => parseCurateArgs(["--dir", "x"]), /--edits/);
        assert.deepEqual(parseCaptureArgs(["--plan", "p.mjs", "--out", "o", "--api", "http://localhost:1"]).api, "http://localhost:1");
    });
});

describe("captureFixtures", () => {
    let server;
    let api;
    let seen;
    let dir;
    const big = { rows: Array.from({ length: 4000 }, (_, i) => ({ id: i, label: `row number ${i}` })) };
    before(async () => {
        server = createServer((req, res) => {
            seen.push({ method: req.method, url: req.url, auth: req.headers.authorization ?? null });
            const send = (status, body) => {
                res.writeHead(status, { "content-type": "application/json" });
                res.end(JSON.stringify(body));
            };
            if (req.url === "/api/v1/auth/login" && req.method === "POST") return send(200, { accessToken: "t0k" });
            if (req.url === "/api/v1/me") return send(200, { name: "Tess", projectId: 7 });
            if (req.url === "/api/v1/projects/7") return send(200, { id: 7, name: "Main St", budget: 1200 });
            if (req.url === "/api/v1/threads?includeResolved=false") return send(200, { records: [] });
            if (req.url === "/api/v1/threads?includeResolved=true") return send(200, { records: [{ id: 1 }] });
            if (req.url === "/api/v1/network") return send(200, big);
            if (req.url === "/api/v1/queue") return send(503, { title: "circuit open" });
            return send(404, { title: "nope" });
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        api = `http://127.0.0.1:${server.address().port}`;
    });
    after(() => new Promise((r) => server.close(r)));
    beforeEach(() => {
        seen = [];
        dir = mkdtempSync(path.join(tmpdir(), "dce-capture-"));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    const plan = {
        apiPrefix: "/api/v1",
        subject: "one project",
        async authorize({ api: base, apiPrefix, fetch }) {
            const r = await fetch(`${base}${apiPrefix}/auth/login`, { method: "POST", body: "{}" });
            return { authorization: `Bearer ${(await r.json()).accessToken}` };
        },
        async capture({ get }) {
            const me = await get("/me");
            await get("/me"); // asked twice, requested once
            await get(`/projects/${me.projectId}`, { alsoAs: [`/projects/${me.projectId}?view=full`] });
            await get("/threads?includeResolved=false");
            await get("/threads?includeResolved=true");
            await get("/network", { transform: (b) => ({ rows: b.rows.slice(0, 3000) }) });
            await get("/queue");
        },
    };

    it("records each GET once, signed in, under every key the UI reads it by", async () => {
        const out = path.join(dir, "v1.0.0");
        const index = await captureFixtures({ plan, api, out, version: "v1.0.0", log: silent });
        const gets = seen.filter((s) => s.method !== "POST");
        assert.ok(gets.every((s) => s.method === "GET"), "capture sends nothing but GET");
        assert.ok(gets.every((s) => s.auth === "Bearer t0k"), "every GET carries the plan's headers");
        assert.equal(gets.filter((s) => s.url === "/api/v1/me").length, 1);
        assert.equal(index.apiPrefix, "/api/v1");
        assert.equal(index.version, "v1.0.0");
        assert.equal(index.subject, "one project");
        assert.deepEqual(index.responses["/projects/7?view=full"], { status: 200, file: "projects__7.json", aliasOf: "/projects/7" });
        assert.ok(index.responses["/threads?includeResolved=false"] && index.responses["/threads?includeResolved=true"]);
        assert.deepEqual(readJson(path.join(out, "projects__7.json")), { id: 7, name: "Main St", budget: 1200 });
    });
    it("records an error status as such, transforms only what the plan declares, and writes large answers compact", async () => {
        const out = path.join(dir, "v1.0.0");
        const index = await captureFixtures({ plan, api, out, log: silent });
        assert.equal(index.responses["/queue"].status, 503);
        const net = readFileSync(path.join(out, "network.json"), "utf8");
        assert.equal(JSON.parse(net).rows.length, 3000);
        assert.ok(!net.includes("\n  "), "a large answer is compact");
        assert.ok(readFileSync(path.join(out, "me.json"), "utf8").includes("\n  "), "a small one is readable");
        // What the exporter reads is exactly this index.
        assert.equal(loadFixtures(out).entries.length, Object.keys(index.responses).length);
    });
    it("keeps a record of every number the API answered, before any transform", async () => {
        const out = path.join(dir, "v1.0.0");
        const index = await captureFixtures({ plan, api, out, log: silent });
        assert.equal(index.recordedNumbers, RECORDED_NUMBERS_FILE);
        const recorded = readJson(path.join(out, RECORDED_NUMBERS_FILE));
        assert.deepEqual(recorded, [...recorded].sort((a, b) => a - b), "sorted");
        assert.equal(new Set(recorded).size, recorded.length, "distinct");
        for (const n of [7, 1200, 1]) assert.ok(recorded.includes(n), `${n} was answered`);
        assert.ok(recorded.includes(3999), "a row the plan's transform trimmed away was still answered");
        assert.ok(!loadFixtures(out).entries.some((e) => e.file === RECORDED_NUMBERS_FILE), "the record is not an answer");
    });
    it("replaces an existing fixtures directory on recapture", async () => {
        const out = path.join(dir, "v1.0.0");
        await captureFixtures({ plan, api, out, log: silent });
        writeFileSync(path.join(out, "stale.json"), "{}");
        await captureFixtures({ plan, api, out, log: silent });
        assert.ok(!existsSync(path.join(out, "stale.json")));
    });
    it("refuses a base URL that is not loopback, before any request", async () => {
        await assert.rejects(captureFixtures({ plan, api: "https://api.example.com", out: path.join(dir, "x"), log: silent }), /LOCAL stack only/);
        assert.equal(seen.length, 0);
    });
    it("refuses to write into a non-empty directory that is not a fixtures directory", async () => {
        writeFileSync(path.join(dir, "important.txt"), "keep me");
        await assert.rejects(captureFixtures({ plan, api, out: dir, log: silent }), /not empty and holds no fixtures index/);
        assert.ok(existsSync(path.join(dir, "important.txt")));
    });
    it("refuses a plan with no capture function, and a resource that is not a path", async () => {
        await assert.rejects(captureFixtures({ plan: {}, api, out: path.join(dir, "x"), log: silent }), /must export `async function capture/);
        await assert.rejects(
            captureFixtures({ plan: { capture: ({ get }) => get("me") }, api, out: path.join(dir, "y"), log: silent }),
            /resource path starting "\/"/,
        );
    });
});

describe("curateFixtures", () => {
    let dir;
    const write = (name, body) => writeFileSync(path.join(dir, name), JSON.stringify(body, null, 2) + "\n");
    beforeEach(() => {
        dir = mkdtempSync(path.join(tmpdir(), "dce-curate-"));
        write("projects.json", { records: [{ id: "a", name: "test", runs: 3 }, { id: "b", name: "We are closing Main St between", runs: 5 }] });
        write("projects__b__kpis.json", { delay: 12.5, vehicles: 830 });
        write("index.json", {
            apiPrefix: "/api/v1",
            responses: {
                "/projects": { status: 200, file: "projects.json" },
                "/projects/b/kpis": { status: 200, file: "projects__b__kpis.json" },
            },
        });
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    const good = [
        {
            id: "probes",
            removes: "development probe projects",
            note: "project list: probes dropped",
            apply({ read, write: w }) {
                const p = read("/projects");
                w("/projects", { records: p.records.filter((r) => r.name !== "test") });
            },
        },
        {
            id: "title",
            removes: "an intake-truncated project name",
            note: "project name: the truncated sentence replaced by a title",
            apply({ read, write: w }) {
                const p = read("/projects");
                w("/projects", { records: p.records.map((r) => (r.id === "b" ? { ...r, name: "Main St closure" } : r)) });
            },
        },
        {
            id: "run",
            removes: "a certification queue stuck behind an unrelated job",
            note: "certified run: assembled from the project's own KPIs; only its id and timestamp are invented",
            apply({ read, write: w }) {
                const k = read("/projects/b/kpis");
                w("/certified-runs/r1", { id: "r1", at: "2026-09-23T00:00:00Z", frozen: { delay: k.delay, vehicles: k.vehicles } });
            },
        },
    ];

    it("applies the edits, flags what it touched, and records one note per edit", () => {
        const r = curateFixtures({ dir, edits: good, log: silent });
        assert.deepEqual(r.written.sort(), ["/certified-runs/r1", "/projects"]);
        const index = readJson(path.join(dir, "index.json"));
        assert.deepEqual(index.curated.notes, [
            "project list: probes dropped (removes: development probe projects)",
            "project name: the truncated sentence replaced by a title (removes: an intake-truncated project name)",
            "certified run: assembled from the project's own KPIs; only its id and timestamp are invented (removes: a certification queue stuck behind an unrelated job)",
        ]);
        assert.equal(index.responses["/projects"].curated, true);
        assert.equal(index.responses["/projects/b/kpis"].curated, undefined);
        assert.deepEqual(index.responses["/certified-runs/r1"], { status: 200, file: "certified-runs__r1.json", curated: true, assembled: true });
        assert.deepEqual(readJson(path.join(dir, "projects.json")).records, [{ id: "b", name: "Main St closure", runs: 5 }]);
    });
    it("is a no-op when run again", () => {
        curateFixtures({ dir, edits: good, log: silent });
        const before = readFileSync(path.join(dir, "projects.json"), "utf8") + readFileSync(path.join(dir, "index.json"), "utf8");
        curateFixtures({ dir, edits: good, log: silent });
        const after = readFileSync(path.join(dir, "projects.json"), "utf8") + readFileSync(path.join(dir, "index.json"), "utf8");
        assert.equal(after, before);
    });
    it("refuses an edit that changes a figure, and writes nothing", () => {
        const before = readFileSync(path.join(dir, "projects__b__kpis.json"), "utf8");
        const edits = [{
            id: "nicer", removes: "an unflattering delay", note: "delay rounded",
            apply({ read, write: w }) { w("/projects/b/kpis", { ...read("/projects/b/kpis"), delay: 10 }); },
        }];
        assert.throws(() => curateFixtures({ dir, edits, log: silent }), /edit "nicer" changes a figure in \/projects\/b\/kpis: 10/);
        assert.equal(readFileSync(path.join(dir, "projects__b__kpis.json"), "utf8"), before);
        assert.equal(readJson(path.join(dir, "index.json")).curated, undefined);
    });
    it("refuses an edit that is not idempotent", () => {
        const edits = [{
            id: "suffix", removes: "a bare name", note: "name suffixed",
            apply({ read, write: w }) {
                const p = read("/projects");
                w("/projects", { records: p.records.map((r) => ({ ...r, name: `${r.name}!` })) });
            },
        }];
        assert.throws(() => curateFixtures({ dir, edits, log: silent }), /not idempotent .*\/projects \(edit "suffix"\)/);
    });
    it("refuses an edit that does not name the artefact it removes", () => {
        assert.throws(() => validateEdits([{ id: "x", note: "n", apply() {} }]), /needs `removes`/);
        assert.throws(() => validateEdits([{ id: "x", removes: "r", apply() {} }]), /needs a `note`/);
        assert.throws(() => validateEdits([{ id: "x", removes: "r", note: "n", apply() {} }, { id: "x", removes: "r", note: "n", apply() {} }]), /duplicate id/);
        assert.throws(() => validateEdits([]), /non-empty `edits` array/);
    });
    it("on a raw capture with no record of numbers, takes the record from it on the first run", () => {
        curateFixtures({ dir, edits: good, log: silent });
        const index = readJson(path.join(dir, "index.json"));
        assert.equal(index.recordedNumbers, RECORDED_NUMBERS_FILE);
        assert.deepEqual(readJson(path.join(dir, RECORDED_NUMBERS_FILE)), [3, 5, 12.5, 830]);
    });
    it("stays strict on a second run: it checks against what the API answered, not the curated files", () => {
        curateFixtures({ dir, edits: good, log: silent });
        const kpis = readFileSync(path.join(dir, "projects__b__kpis.json"), "utf8");
        // 3 was answered (by a probe project the first run dropped), so it may still be used...
        const reuse = { id: "reuse", removes: "r", note: "n", apply({ read, write: w }) { w("/projects/b/kpis", { ...read("/projects/b/kpis"), probes: 3 }); } };
        assert.doesNotThrow(() => curateFixtures({ dir, edits: [...good, reuse], log: silent }));
        // ...but a figure the API never gave is refused, however many runs came before.
        writeFileSync(path.join(dir, "projects__b__kpis.json"), kpis);
        const invent = {
            id: "invent", removes: "r", note: "n",
            apply({ read, write: w }) { w("/projects", { records: read("/projects").records.map((r) => ({ ...r, runs: 10 })) }); },
        };
        assert.throws(() => curateFixtures({ dir, edits: [...good, invent], log: silent }), /edit "invent" changes a figure in \/projects: 10/);
        assert.equal(readFileSync(path.join(dir, "projects__b__kpis.json"), "utf8"), kpis, "a refused run writes nothing");
    });
    it("catches a figure changed by hand after curation, in an answer no edit touches", () => {
        curateFixtures({ dir, edits: good, log: silent });
        write("projects__b__kpis.json", { delay: 10, vehicles: 830 });
        const indexBefore = readFileSync(path.join(dir, "index.json"), "utf8");
        assert.throws(() => curateFixtures({ dir, edits: good, log: silent }), /\/projects\/b\/kpis holds a figure the API never answered: 10 .*changed outside curation/);
        assert.equal(readFileSync(path.join(dir, "index.json"), "utf8"), indexBefore);
    });
    it("refuses a curated directory whose record of numbers is gone, or was never kept", () => {
        curateFixtures({ dir, edits: good, log: silent });
        rmSync(path.join(dir, RECORDED_NUMBERS_FILE));
        assert.throws(() => curateFixtures({ dir, edits: good, log: silent }), /names recorded-numbers\.json, .* but it is missing — capture again/);
        const index = readJson(path.join(dir, "index.json"));
        delete index.recordedNumbers;
        write("index.json", index);
        assert.throws(() => curateFixtures({ dir, edits: good, log: silent }), /curated before, and holds no recorded-numbers\.json/);
        write(RECORDED_NUMBERS_FILE, ["12.5"]);
        write("index.json", { ...index, recordedNumbers: RECORDED_NUMBERS_FILE });
        assert.throws(() => curateFixtures({ dir, edits: good, log: silent }), /is not a list of numbers/);
    });
    it("refuses a directory with no fixtures index", () => {
        const empty = path.join(dir, "empty");
        mkdirSync(empty);
        assert.throws(() => curateFixtures({ dir: empty, edits: good, log: silent }), /no fixtures index/);
    });
});

describe("numbersIn", () => {
    it("collects every JSON number, deep, and nothing that merely looks like one", () => {
        assert.deepEqual([...numbersIn({ a: 1, b: [2, { c: 3.5 }], d: "4", e: null })].sort(), [1, 2, 3.5]);
    });
});
