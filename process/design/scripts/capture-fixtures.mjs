#!/usr/bin/env node
/**
 * capture-fixtures.mjs — record a wired version's API answers from a running LOCAL stack, as the
 * mock data prompt 04's production export ships (`--fixtures`). GET only.
 *
 *   node capture-fixtures.mjs --plan <host plan module> --out <FIXTURES_DIR>/<VERSION>
 *                             [--api <base URL>] [--version <VERSION>]
 *
 * WHY RECORD RATHER THAN WRITE. A production version is usually `wired: true`: every figure its
 * screens show arrives from the API, so its source carries no mocks. A hand-written mock drifts
 * from the contract the day a field moves, and reads like a mock — round numbers, a grid of
 * streets. A recorded answer is the contract by construction and carries real content.
 *
 * WHAT IS GENERIC, AND LIVES HERE: the GET-only request function, loopback-only enforcement,
 * file naming, compact writing of large answers, one answer recorded under several keys, the
 * index format the exporter reads, the record of every number the API answered (see below), and
 * the report of error statuses.
 *
 * THE RECORD OF NUMBERS. Beside the answers, `recorded-numbers.json` (named by index.json's
 * `recordedNumbers`) lists every distinct number the API answered, before any plan transform.
 * curate-fixtures.mjs checks every curated answer against it — not against the answer files, which
 * a curation run has already edited — so curation stays strict however often it is re-run, and a
 * figure changed by hand after curation is caught. Recapturing rewrites it; nothing else should.
 *
 * WHAT IS THE HOST'S, AND LIVES IN ITS PLAN: which requests to make, which ids to follow from one
 * answer to the next, which query-string variants the UI really sends, how to sign in, and any
 * trimming an oversized answer needs. The plan is a module the host commits and binds through
 * FIXTURE_CAPTURE_CMD; see process/design/prompts/04-preview-and-export.md, §4.
 *
 *   export const apiPrefix = "/api/v1";              // what the app puts before a resource path
 *   export const api = "http://localhost:3000";       // default base URL; --api overrides it
 *   export const subject = "one real study, …";       // optional: one line on what was recorded
 *   export async function authorize({ api, apiPrefix, env, fetch }) { return { authorization: … } }
 *   export async function capture({ get, env }) {
 *     const me = await get("/users/me");
 *     await get("/threads?includeResolved=false");   // every variant the UI sends, each its own key
 *     await get("/threads?includeResolved=true");
 *     await get(`/projects/${id}`, { alsoAs: [`/projects/${id}?view=full`] });  // one answer, two keys
 *     await get("/network", { transform: (body) => trim(body) });             // declared, not silent
 *   }
 *
 * `authorize` is the only place a plan may send anything but a GET, and it exists for one thing:
 * signing in to a LOCAL development account. It must not write product data. Everything `capture`
 * does goes through `get`, which cannot send another method.
 *
 * Never point this at a deployment: a base URL that is not loopback is refused before any request.
 * A stack whose services started out of order can answer 503 for a while (a circuit breaker still
 * open); the report says so — wait, and capture again.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Answers larger than this are written compact: pretty-printed, they are mostly whitespace. */
export const COMPACT_ABOVE_BYTES = 100_000;

/** File names are capped: a long query string past Windows' MAX_PATH makes git refuse the file. */
export const MAX_NAME = 80;

/** Every distinct number the API answered, as captured: what curation may never go beyond. */
export const RECORDED_NUMBERS_FILE = "recorded-numbers.json";

/** Every JSON number in a value, deep. */
export function numbersIn(value, into = new Set()) {
    if (typeof value === "number") into.add(value);
    else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, into));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersIn(v, into));
    return into;
}

/** Write the record of numbers, compact and sorted: it is read by a script, never by a person. */
export function writeRecordedNumbers(dir, numbers) {
    writeFileSync(path.join(dir, RECORDED_NUMBERS_FILE), JSON.stringify([...numbers].sort((a, b) => a - b)) + "\n");
}

export function parseCaptureArgs(argv) {
    const args = { plan: null, out: null, api: null, version: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            const v = argv[++i];
            if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
            return v;
        };
        if (a === "--plan") args.plan = next();
        else if (a === "--out") args.out = next();
        else if (a === "--api") args.api = next();
        else if (a === "--version") args.version = next();
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.plan) throw new Error("--plan <host capture plan module> is required");
    if (!args.out) throw new Error("--out <FIXTURES_DIR>/<VERSION> is required");
    return args;
}

/**
 * A fixture's file name, from the resource path it answers: readable, and capped at MAX_NAME
 * characters — a long name keeps its head and gains a hash of the full path, so it stays unique.
 */
export function fixtureName(resource) {
    const name = resource
        .replace(/^\//, "")
        .replace(/[?&=]/g, "_")
        .replace(/[^A-Za-z0-9_.-]+/g, "__") || "root";
    if (name.length + ".json".length <= MAX_NAME) return `${name}.json`;
    const hash = createHash("sha1").update(resource).digest("hex").slice(0, 10);
    return `${name.slice(0, MAX_NAME - ".json".length - hash.length - 1)}~${hash}.json`;
}

/** Whether a base URL points at this machine — the only place a capture may run against. */
export function isLoopback(base) {
    let url;
    try {
        url = new URL(base);
    } catch {
        return false;
    }
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host);
}

/**
 * Run a plan and write `<out>/index.json` plus one file per answer. Returns the index.
 *
 *   plan      the imported plan module (see the header)
 *   api       base URL, loopback only
 *   out       the version's fixtures directory — replaced if it is one, refused if it is
 *             anything else that is not empty
 */
export async function captureFixtures({ plan, api, out, version = null, env = process.env, fetchImpl = fetch, log = console.log }) {
    if (typeof plan?.capture !== "function") throw new Error("the plan must export `async function capture({ get })`");
    const base = (api ?? plan.api ?? "").replace(/\/$/, "");
    if (!base) throw new Error("no API base URL: pass --api or export `api` from the plan");
    if (!isLoopback(base)) {
        throw new Error(`refusing to capture from ${base}: fixtures are recorded from a LOCAL stack only, never a deployment`);
    }
    const apiPrefix = plan.apiPrefix ?? "";
    const outDir = path.resolve(out);
    if (existsSync(outDir) && readdirSync(outDir).length) {
        if (!existsSync(path.join(outDir, "index.json"))) {
            throw new Error(`refusing to write into ${outDir}: it is not empty and holds no fixtures index.json`);
        }
        rmSync(outDir, { recursive: true, force: true });
    }
    mkdirSync(outDir, { recursive: true });

    const headers = typeof plan.authorize === "function"
        ? (await plan.authorize({ api: base, apiPrefix, env, fetch: fetchImpl })) ?? {}
        : {};

    const responses = {};
    const bodies = new Map();
    const recorded = new Set();
    async function get(resource, { transform = null, compact = false, alsoAs = [] } = {}) {
        if (typeof resource !== "string" || !resource.startsWith("/")) {
            throw new Error(`get() takes a resource path starting "/" (got ${JSON.stringify(resource)})`);
        }
        if (bodies.has(resource)) return bodies.get(resource);
        const res = await fetchImpl(`${base}${apiPrefix}${resource}`, { method: "GET", headers });
        const text = await res.text();
        let body;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text;
        }
        numbersIn(body, recorded);
        const stored = res.ok && transform ? transform(body) : body;
        const file = fixtureName(resource);
        const serialized = compact || text.length > COMPACT_ABOVE_BYTES ? JSON.stringify(stored) : JSON.stringify(stored, null, 2);
        writeFileSync(path.join(outDir, file), serialized + "\n");
        for (const key of [resource, ...alsoAs]) {
            responses[key] = key === resource ? { status: res.status, file } : { status: res.status, file, aliasOf: resource };
        }
        log(`  ${String(res.status).padEnd(3)} GET ${resource}${alsoAs.length ? ` (also as ${alsoAs.join(", ")})` : ""}`);
        const result = res.ok ? stored : null;
        bodies.set(resource, result);
        return result;
    }

    await plan.capture({ get, env });

    const index = {
        _about:
            "Recorded by process/design/scripts/capture-fixtures.mjs from a local stack. Keys are resource " +
            "paths (the app adds apiPrefix); values name the fixture file and the status the API answered.",
        version,
        apiPrefix,
        subject: plan.subject ?? null,
        recordedAt: new Date().toISOString(),
        recordedNumbers: RECORDED_NUMBERS_FILE,
        responses: Object.fromEntries(Object.entries(responses).sort(([a], [b]) => a.localeCompare(b))),
    };
    writeRecordedNumbers(outDir, recorded);
    writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");

    const failed = Object.entries(responses).filter(([, v]) => v.status >= 400 && !v.aliasOf);
    log(`  ${bodies.size} answer(s) -> ${outDir}`);
    if (failed.length) {
        log(`  ${failed.length} answered an error and are recorded as such: ${failed.map(([k, v]) => `${k} (${v.status})`).join(", ")}`);
        if (failed.some(([, v]) => v.status >= 500)) {
            log("  a 5xx from a stack whose services started out of order is usually transient — wait, and capture again");
        }
    }
    return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    (async () => {
        const args = parseCaptureArgs(process.argv.slice(2));
        const plan = await import(pathToFileURL(path.resolve(args.plan)).href);
        await captureFixtures({ plan, api: args.api, out: args.out, version: args.version });
    })().catch((err) => {
        console.error(`  ${err.message}`);
        process.exit(1);
    });
}
