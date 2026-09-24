#!/usr/bin/env node
/**
 * curate-fixtures.mjs — apply a host's DECLARED edits to recorded fixtures, and refuse any edit
 * that breaks the curation contract.
 *
 *   node curate-fixtures.mjs --dir <FIXTURES_DIR>/<VERSION> --edits <host edits module>
 *
 * A capture records a local development database, and a development database says so: studies
 * named "test", every comment written by the one seeded account, a queue stuck behind an
 * unrelated job. Handed to a design tool verbatim, that is what it draws. Curation removes those
 * artefacts — and only those. The contract, enforced here rather than trusted:
 *
 *   1. Never change a figure. Every number in every answer, curated or not, must be a number the
 *      API actually answered — checked against the capture's record of numbers
 *      (`recorded-numbers.json`, see capture-fixtures.mjs), never against the answer files, which
 *      an earlier run has already edited. So a second run is exactly as strict as the first, and a
 *      figure changed by hand after curation is refused on the next run. An edit may rename, drop,
 *      reorder, re-attribute and assemble a record from real answers (inventing only ids,
 *      timestamps and provenance); it may not produce a figure the API never gave.
 *   2. Each edit removes one NAMED artefact of the environment, and says which: `removes` and
 *      `note` are required.
 *   3. Idempotent. The edits are applied twice in memory; if the second pass changes anything, the
 *      run is refused. Re-running curation after a re-run of it is therefore a no-op.
 *
 * A capture from before the record existed has none. If it was never curated its files are still
 * the raw answers, so the record is taken from them on this first run and written beside them; if
 * it was curated already, the raw numbers are gone and the run is refused — capture again.
 *
 * Nothing is written unless all three hold. The notes land in index.json under `curated`, one per
 * edit, and prompt 04's production export repeats them verbatim in its README.
 *
 * The edits module:
 *
 *   export const edits = [
 *     {
 *       id: "project-name",
 *       removes: "an intake-truncated project name",
 *       note: "project name: the truncated intake sentence replaced by a planner's title",
 *       apply({ read, write, resources }) {
 *         const p = read("/projects/42");
 *         write("/projects/42", { ...p, name: "Main Street closure" });
 *       },
 *     },
 *   ];
 *
 * `read` returns a copy of the current answer (null if none), `write` stages a replacement — or a
 * new, assembled resource — and `resources()` lists every recorded key.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { COMPACT_ABOVE_BYTES, RECORDED_NUMBERS_FILE, fixtureName, numbersIn, writeRecordedNumbers } from "./capture-fixtures.mjs";

export { numbersIn };

export function parseCurateArgs(argv) {
    const args = { dir: null, edits: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            const v = argv[++i];
            if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
            return v;
        };
        if (a === "--dir") args.dir = next();
        else if (a === "--edits") args.edits = next();
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.dir) throw new Error("--dir <FIXTURES_DIR>/<VERSION> is required");
    if (!args.edits) throw new Error("--edits <host edits module> is required");
    return args;
}

/** Check the edits module's shape: contract rule 2, and that each edit can run at all. */
export function validateEdits(edits) {
    if (!Array.isArray(edits) || !edits.length) throw new Error("the edits module must export a non-empty `edits` array");
    const ids = new Set();
    for (const [i, e] of edits.entries()) {
        const where = `edit ${e?.id ? `"${e.id}"` : `#${i + 1}`}`;
        if (!e?.id || typeof e.id !== "string") throw new Error(`${where}: needs a string \`id\``);
        if (ids.has(e.id)) throw new Error(`${where}: duplicate id`);
        ids.add(e.id);
        if (!e.removes || typeof e.removes !== "string") throw new Error(`${where}: needs \`removes\` — the one artefact of the environment it removes`);
        if (!e.note || typeof e.note !== "string") throw new Error(`${where}: needs a \`note\` — what the export README will repeat`);
        if (typeof e.apply !== "function") throw new Error(`${where}: needs an \`apply\` function`);
    }
}

/**
 * The numbers curation may use: the capture's record (see the header). Returns { numbers, derived },
 * `derived` true when there was no record and it was just taken from never-curated raw answers.
 */
function recordedNumbers(dir, index, state) {
    if (index.recordedNumbers) {
        const file = path.join(dir, index.recordedNumbers);
        if (!existsSync(file)) throw new Error(`index.json names ${index.recordedNumbers}, the capture's record of numbers, but it is missing — capture again`);
        const list = JSON.parse(readFileSync(file, "utf8"));
        if (!Array.isArray(list) || list.some((n) => typeof n !== "number")) throw new Error(`${file} is not a list of numbers — capture again`);
        return { numbers: new Set(list), derived: false };
    }
    if (index.curated) {
        throw new Error(`${dir} was curated before, and holds no ${RECORDED_NUMBERS_FILE}: the numbers the API answered are no longer known, so a figure cannot be checked — capture again, then curate`);
    }
    return { numbers: numbersIn([...state.values()]), derived: true };
}

/** Apply every edit, in order, to a copy of `state` (Map resource → body). */
function applyAll(edits, state) {
    const next = new Map([...state].map(([k, v]) => [k, structuredClone(v)]));
    const writtenBy = new Map(); // resource -> edit id (last writer)
    for (const edit of edits) {
        edit.apply({
            read: (r) => (next.has(r) ? structuredClone(next.get(r)) : null),
            write: (r, body) => {
                if (typeof r !== "string" || !r.startsWith("/")) throw new Error(`edit "${edit.id}": write() takes a resource path starting "/"`);
                next.set(r, structuredClone(body));
                writtenBy.set(r, edit.id);
            },
            resources: () => [...next.keys()],
        });
    }
    return { next, writtenBy };
}

/**
 * Curate `<dir>` with `edits`. Returns { written, notes }. Throws — writing nothing — on any
 * breach of the contract.
 */
export function curateFixtures({ dir, edits, log = console.log }) {
    validateEdits(edits);
    const indexPath = path.join(dir, "index.json");
    if (!existsSync(indexPath)) throw new Error(`no fixtures index at ${indexPath} — capture first`);
    const index = JSON.parse(readFileSync(indexPath, "utf8"));

    const state = new Map();
    for (const [resource, rec] of Object.entries(index.responses ?? {})) {
        if (rec.aliasOf) continue; // one answer, several keys: the answer is curated once
        const file = path.join(dir, rec.file);
        if (!existsSync(file)) continue;
        const text = readFileSync(file, "utf8");
        try {
            state.set(resource, JSON.parse(text));
        } catch {
            state.set(resource, text);
        }
    }
    const recorded = recordedNumbers(dir, index, state);
    const unrecorded = (body) => [...numbersIn(body)].filter((n) => !recorded.numbers.has(n));
    // A figure already on disk that the API never gave was put there by hand, not by an edit.
    for (const [resource, body] of state) {
        const invented = unrecorded(body);
        if (invented.length) {
            throw new Error(`${resource} holds a figure the API never answered: ${invented.join(", ")} — it was changed outside curation; undo that change, or capture again`);
        }
    }

    const first = applyAll(edits, state);
    const second = applyAll(edits, first.next);
    const drift = [...second.writtenBy.keys()].filter((r) => !isDeepStrictEqual(first.next.get(r), second.next.get(r)));
    if (drift.length) {
        throw new Error(`not idempotent — applied twice, these change again: ${drift.map((r) => `${r} (edit "${second.writtenBy.get(r)}")`).join(", ")}`);
    }
    for (const [resource, editId] of first.writtenBy) {
        const invented = unrecorded(first.next.get(resource));
        if (invented.length) {
            throw new Error(`edit "${editId}" changes a figure in ${resource}: ${invented.join(", ")} appear in no recorded answer`);
        }
    }

    const written = [];
    for (const [resource] of first.writtenBy) {
        const body = first.next.get(resource);
        const rec = index.responses[resource];
        const file = rec?.file ?? fixtureName(resource);
        const pretty = JSON.stringify(body, null, 2);
        writeFileSync(path.join(dir, file), (pretty.length > COMPACT_ABOVE_BYTES ? JSON.stringify(body) : pretty) + "\n");
        index.responses[resource] = rec
            ? { ...rec, curated: true }
            : { status: 200, file, curated: true, assembled: true };
        written.push(resource);
    }
    if (recorded.derived) {
        writeRecordedNumbers(dir, recorded.numbers);
        index.recordedNumbers = RECORDED_NUMBERS_FILE;
    }
    const notes = edits.map((e) => `${e.note} (removes: ${e.removes})`);
    index.curated = { notes, edits: edits.map((e) => e.id) };
    index.responses = Object.fromEntries(Object.entries(index.responses).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");

    log(`  curated ${written.length} answer(s) in ${dir} with ${edits.length} edit(s)`);
    for (const n of notes) log(`    - ${n}`);
    return { written, notes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    (async () => {
        const args = parseCurateArgs(process.argv.slice(2));
        const mod = await import(pathToFileURL(path.resolve(args.edits)).href);
        curateFixtures({ dir: path.resolve(args.dir), edits: mod.edits });
    })().catch((err) => {
        console.error(`  ${err.message}`);
        process.exit(1);
    });
}
