#!/usr/bin/env node
/**
 * export-design-version.mjs — Phase 5. Called by prompt 04.
 *
 * Produces a READABLE SOURCE TREE for the design tool, as `vX.Y.Z-export.zip`:
 *
 *   README.md          what this is, the flow, the screen inventory, how to read the tree
 *   screens/           the version's screens
 *   components/        version-specific composites
 *   design-system/     the staging + shipped components the version ACTUALLY imports, source form
 *   tokens/            the token map — the design-system CSS custom properties
 *   data/              mock data
 *
 * Two properties are the whole point, and both are easy to get wrong:
 *
 *   1. It resolves the design-system components the version actually imports, TRANSITIVELY,
 *      FROM SOURCE — not from dist/. The staging bundle is self-contained (it inlines cn, Icon
 *      and the glyph set), so dist is the wrong tree to copy from: it would bury the real source
 *      the tool wants to read under bundled noise. We walk the imports back to
 *      <ds>/src/components/** and <ds>/src/staging/<version>/**.
 *
 *   2. It is a PURE COPY and never mutates a source tree. No Playwright, no browser, no
 *      screenshots: the design tool reads code and rebuilds screens from it, so a rendered image
 *      would add a browser dependency to every export for no benefit. See docs/design-testing.md.
 *
 * The zip is written by a tiny store-only (uncompressed) ZIP writer below, deliberately with no
 * external dependency and no shell-out — GNU `tar` reads `C:/…` as a remote host and there is no
 * `zip` on stock Windows, so a pure-JS writer is the only portable, deterministic option.
 *
 * TWO MODES, one format family:
 *
 *   --mode design (default)   a design version: <frontend>/src/pages/design/<version>/, its own
 *                             mocks under data/, the registry's DESIGN entry for the route graph.
 *                             Writes <version>-export.zip.
 *   --mode production         the registry's PRODUCTION entry — what the app serves. Walks the real
 *                             import graph from the entry's routes (plus host-declared --shell
 *                             screens and the stylesheet the app's entry imports), across the whole
 *                             of src/, tests excluded, keeping src-relative paths so every import in
 *                             the copy resolves. Mock data is the host's recorded fixtures
 *                             (--fixtures, see capture-fixtures.mjs), or explicitly none. Writes
 *                             <version>-production-export.zip.
 *
 * Usage:
 *   node export-design-version.mjs \
 *     [--mode design|production] \
 *     --version v4.1.0-tech \
 *     --frontend  <path to the frontend package>  \
 *     --design-system <DS_REPO_PATH: the DS repo's source tree> \
 *     --ds-package <DS_PACKAGE_NAME: the name imports spell it with> \
 *     --assets <ASSETS_DIR, see its README> \
 *     --out ./exports
 *     [--shell "/login=src/views/login/login-view.tsx#LoginView" …]   production only, repeatable
 *     [--fixtures <FIXTURES_DIR>/<version>]                          production only
 *
 * --frontend defaults to the current directory. --design-system is required in the design mode;
 * a relative path that is not a source tree from a linked git worktree is retried against the
 * main checkout. In the production mode a missing source tree degrades, loudly, to the installed
 * package: component names and tokens, no component source. --ds-package defaults to the DS
 * package.json's name — pass it whenever the frontend imports the design system under an alias.
 * --assets is optional (omitting it means no reference image can be matched, and every
 * live-render file is reported unresolved); --out defaults to the current directory.
 */

import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

// ── argument parsing ────────────────────────────────────────────────────────

export const MODES = ["design", "production"];

export function parseArgs(argv) {
    const args = {
        mode: "design", frontend: ".", designSystem: null, dsPackage: null, out: ".", version: null,
        assets: null, fixtures: null, shell: [],
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            const v = argv[++i];
            if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
            return v;
        };
        if (a === "--version") args.version = next();
        else if (a === "--mode") args.mode = next();
        else if (a === "--frontend") args.frontend = next();
        else if (a === "--design-system" || a === "--ds") args.designSystem = next();
        else if (a === "--ds-package") args.dsPackage = next();
        else if (a === "--out") args.out = next();
        else if (a === "--assets") args.assets = next();
        else if (a === "--fixtures") args.fixtures = next();
        else if (a === "--shell") args.shell.push(parseShellEntry(next()));
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.version) throw new Error("--version is required");
    if (!MODES.includes(args.mode)) throw new Error(`--mode must be one of ${MODES.join(", ")} (got "${args.mode}")`);
    if (args.mode === "design" && (args.fixtures || args.shell.length)) {
        throw new Error("--fixtures and --shell belong to --mode production: a design version carries its own mocks and owns no shell screen");
    }
    return args;
}

/**
 * One PROD_SHELL_ENTRIES item: `<route>=<file>[#<Component>]`, the file relative to the frontend
 * package. A shell screen is app-level — `/login` — not a registry route; the host declares the
 * ones a user's journey passes through, because walking the app's router instead would drag in
 * every registered version through the registry's own imports.
 *
 * In Git Bash (MSYS) an argument that starts with `/` is rewritten as a Windows path before Node
 * sees it: `/login=…` arrives as `C:/Program Files/Git/login=…`. That is refused like any other
 * malformed entry, with the fix named: `MSYS_NO_PATHCONV=1`.
 */
export function parseShellEntry(value) {
    const m = /^(\/[^=]*)=([^#]+)(?:#([A-Za-z_$][\w$]*))?$/.exec(value ?? "");
    if (!m && /^[A-Za-z]:[\\/][^=]*=/.test(value ?? "")) {
        throw new Error(
            `--shell got "${value}": the route became a Windows path, which is what Git Bash (MSYS) does to an ` +
            `argument starting "/". Run the export again with MSYS_NO_PATHCONV=1 set (MSYS_NO_PATHCONV=1 node …), ` +
            `or from a shell that does not rewrite arguments`,
        );
    }
    if (!m) throw new Error(`--shell expects "<route>=<file>[#Component]", with the route starting "/" (got "${value}")`);
    return { path: m[1], file: m[2].trim(), component: m[3] ?? null };
}

// ── source masking ──────────────────────────────────────────────────────────
//
// Every parser below is a focused regex over source text, never a TS eval — that is what keeps
// the exporter dependency-free. Regexes over raw source have one systematic failure, though: they
// read comments as code. The registry's own doc comments carry `{id}` paths and a
// `component: lazyPage(…)` example, and `version-base.tsx` documents `navigate("/v3/briefing")`
// as the thing never to write. So every parser runs over a MASKED copy: same length, same line
// breaks, comments blanked (and, for brace matching, string contents blanked too), so an offset in
// the mask is an offset in the original.

/**
 * Blank the comments in JS/TS source — and, with `strings: true`, the contents of string,
 * template and regex literals — preserving length and newlines. A lexer, not a parser: enough to
 * tell `//` in a URL string from a comment and `{` in a label from a brace.
 */
export function maskSource(source, { strings = false } = {}) {
    const out = source.split("");
    const n = source.length;
    const blank = (from, to) => {
        for (let k = from; k < to && k < n; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
    };
    // The last significant character outside comments decides whether `/` opens a regex literal.
    const REGEX_AFTER = "(,=:[!&|?{};+-*%<>~^";
    let prev = "";
    let i = 0;
    while (i < n) {
        const c = source[i];
        const d = source[i + 1];
        if (c === "/" && d === "/") {
            let j = source.indexOf("\n", i);
            if (j === -1) j = n;
            blank(i, j);
            i = j;
            continue;
        }
        if (c === "/" && d === "*") {
            const close = source.indexOf("*/", i + 2);
            const j = close === -1 ? n : close + 2;
            blank(i, j);
            i = j;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") {
            let j = i + 1;
            while (j < n && source[j] !== c) {
                if (source[j] === "\\") j++;
                // A plain string cannot span lines; stopping at the newline bounds the damage an
                // apostrophe in JSX text does ("Don't") to its own line.
                else if (c !== "`" && source[j] === "\n") break;
                j++;
            }
            if (strings) blank(i + 1, j);
            i = j + 1;
            prev = c;
            continue;
        }
        if (c === "/" && (prev === "" || REGEX_AFTER.includes(prev))) {
            let j = i + 1;
            let inClass = false;
            while (j < n && source[j] !== "\n") {
                const ch = source[j];
                if (ch === "\\") { j += 2; continue; }
                if (inClass) { if (ch === "]") inClass = false; }
                else if (ch === "[") inClass = true;
                else if (ch === "/") break;
                j++;
            }
            if (strings) blank(i + 1, j);
            i = j + 1;
            prev = "/";
            continue;
        }
        if (!/\s/.test(c)) prev = c;
        i++;
    }
    return out.join("");
}

const OPENERS = { "{": "}", "[": "]", "(": ")" };
const CLOSERS = { "}": "{", "]": "[", ")": "(" };

/** Index of the bracket closing the one at `open` in a fully masked source, or -1. */
function matchingClose(shape, open) {
    const stack = [];
    for (let i = open; i < shape.length; i++) {
        const ch = shape[i];
        if (OPENERS[ch]) stack.push(ch);
        else if (CLOSERS[ch]) {
            if (stack.pop() !== CLOSERS[ch]) return -1;
            if (!stack.length) return i;
        }
    }
    return -1;
}

/** Index of the innermost `{` enclosing `at` in a fully masked source, or -1. */
function enclosingBrace(shape, at) {
    let depth = 0;
    for (let i = at - 1; i >= 0; i--) {
        const ch = shape[i];
        if (CLOSERS[ch]) depth++;
        else if (OPENERS[ch]) {
            if (depth === 0) return ch === "{" ? i : -1;
            depth--;
        }
    }
    return -1;
}

/**
 * The text of an object/array literal with everything nested deeper than its own top level
 * blanked, so a key read from it is one of ITS keys and not a nested object's.
 */
function topLevelOnly(code, shape, open, close) {
    const out = [];
    let depth = 0;
    for (let i = open; i <= close; i++) {
        const ch = shape[i];
        if (OPENERS[ch]) depth++;
        out.push(depth === 1 || (depth === 2 && OPENERS[ch]) ? code[i] : (code[i] === "\n" ? "\n" : " "));
        if (CLOSERS[ch]) depth--;
    }
    return out.join("");
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── registry parsing ────────────────────────────────────────────────────────

/** A route's `component:` value: `lazyPage(() => import("X"), "Name")`, `lazy(() => import("X"))` or `Name`. */
function parseComponentValue(text) {
    const lazyNamed = /^\s*lazyPage\(\s*\(\)\s*=>\s*import\(\s*["'`]([^"'`]+)["'`]\s*\)\s*,\s*["']([A-Za-z0-9_$]+)["']/.exec(text);
    if (lazyNamed) return { component: lazyNamed[2], source: lazyNamed[1] };
    const lazyDefault = /^\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(text);
    if (lazyDefault) return { component: "default", source: lazyDefault[1] };
    const ident = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(text);
    return ident ? { component: ident[1], source: null } : { component: "?", source: null };
}

/** Every version entry in a registry source, as parsed objects, in source order. */
export function parseVersionEntries(source) {
    const code = maskSource(source);
    const shape = maskSource(source, { strings: true });
    const entries = [];
    const seenOpen = new Set();
    for (const m of code.matchAll(/\bid\s*:\s*["']([^"']+)["']/g)) {
        const open = enclosingBrace(shape, m.index);
        if (open === -1 || seenOpen.has(open)) continue;
        const close = matchingClose(shape, open);
        if (close === -1) continue;
        const top = topLevelOnly(code, shape, open, close);
        // `id` must be one of this object's own keys, not a nested object's.
        if (!new RegExp(`\\bid\\s*:\\s*["']${escapeRe(m[1])}["']`).test(top)) continue;
        seenOpen.add(open);
        entries.push(readEntry(m[1], code, shape, open, close, top));
    }
    return entries;
}

function readEntry(id, code, shape, open, close, top) {
    const str = (key) => new RegExp(`\\b${key}\\s*:\\s*["']([^"']*)["']`).exec(top)?.[1];
    const bool = (key) => {
        const r = new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`).exec(top);
        return r ? r[1] === "true" : undefined;
    };
    const routes = [];
    const routesKey = /\broutes\s*:\s*\[/.exec(top);
    if (routesKey) {
        const arrOpen = open + routesKey.index + routesKey[0].length - 1;
        const arrClose = matchingClose(shape, arrOpen);
        for (let i = arrOpen + 1; arrClose !== -1 && i < arrClose; i++) {
            if (shape[i] !== "{") {
                if (OPENERS[shape[i]]) {
                    i = matchingClose(shape, i); // skip anything that is not a route object
                    if (i === -1) break;
                }
                continue;
            }
            const rClose = matchingClose(shape, i);
            if (rClose === -1) break;
            const rTop = topLevelOnly(code, shape, i, rClose);
            const path = /\bpath\s*:\s*["']([^"']*)["']/.exec(rTop)?.[1];
            const compKey = /\bcomponent\s*:/.exec(rTop);
            if (path !== undefined && compKey) {
                const { component, source } = parseComponentValue(code.slice(i + compKey.index + compKey[0].length, rClose));
                routes.push({
                    path,
                    component,
                    guard: /\bguard\s*:\s*["']([^"']*)["']/.exec(rTop)?.[1],
                    source,
                });
            }
            i = rClose;
        }
    }
    return {
        id,
        kind: str("kind"),
        wired: bool("wired"),
        label: str("label"),
        entryRoute: str("entryRoute") ?? "",
        routes,
    };
}

/**
 * Pull one version's entry out of registry.tsx source. Returns
 * { id, kind, wired, label, entryRoute, routes: [{ path, component, guard, source }] }, or null.
 *
 * A registry may hold the SAME id twice — a production entry and a design entry of one version
 * (docs/design-version-registry.md) — so `kind` picks which. Without `kind`, production wins, the
 * rule `findVersion` itself follows. Parsed over masked source (see maskSource), so a comment above
 * an entry that mentions `{id}` or shows an example route cannot be mistaken for the entry.
 *
 * `routes[].source` is the import path of a `lazyPage(() => import("…"), "Name")` route, and null
 * for a directly referenced component (`component: WidgetsView`), which `parseImportBindings` on the
 * same registry source resolves to a file.
 */
export function parseVersionEntry(source, versionId, { kind } = {}) {
    const matches = parseVersionEntries(source).filter((e) => e.id === versionId);
    if (kind) return matches.find((e) => e.kind === kind) ?? null;
    return matches.find((e) => e.kind === "prod") ?? matches[0] ?? null;
}

/**
 * Every import binding in a source, by LOCAL name: `import { A as B } from "x"` is
 * { local: "B", imported: "A", spec: "x" }; a default import has imported "default".
 */
export function parseImportBindings(source) {
    const out = [];
    const code = maskSource(source);
    for (const m of code.matchAll(/\bimport\s+(?!type\b)([^;'"]*?)\s+from\s+["']([^"']+)["']/g)) {
        const clause = m[1];
        const braced = /\{([^}]*)\}/.exec(clause);
        if (braced) {
            for (const raw of braced[1].split(",")) {
                const part = raw.trim().replace(/^type\s+/, "");
                if (!part) continue;
                const [imported, local] = part.split(/\s+as\s+/).map((s) => s.trim());
                out.push({ local: local ?? imported, imported, spec: m[2] });
            }
        }
        const def = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
        if (def && !def.startsWith("*")) out.push({ local: def, imported: "default", spec: m[2] });
    }
    return out;
}

// ── in-app navigation ───────────────────────────────────────────────────────
//
// A design tool that never executes the code cannot follow navigation calls itself, and a
// dynamic destination — `nav(\`/project/${event.id}\`)` — carries no readable string for it (or
// a human skimming the tree) to match against a screen by eye. Left to guess, it falls back to
// text similarity ("Draft briefing" button → the BriefingPage screen) and lands on the wrong
// screen, silently. Resolving every navigation call against the version's own registered routes
// and writing the result into the README turns that guess into a fact.

/**
 * Every literal (or template-with-holes) destination in a source file: `nav(…)` (what
 * `useVersionNav` returns), `navigate(…)`, and a `<VersionLink to="…">`. Comments are excluded —
 * a doc comment's `navigate("/v3/briefing")` example is not a call.
 */
export function parseNavTargets(source) {
    const code = maskSource(source);
    const out = [];
    const norm = (lit) => {
        const raw = lit.slice(1, -1);
        return lit[0] === "`" ? raw.replace(/\$\{[^}]*\}/g, "*") : raw; // `/project/${id}` -> /project/*
    };
    const re = /\b(?:nav|navigate)\(\s*(`[^`]*`|"[^"]*"|'[^']*')|<VersionLink\b[^>]*?\bto=\{?\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
    for (const m of code.matchAll(re)) out.push(norm(m[1] ?? m[2]));
    return out;
}

/**
 * Match a `nav()` destination against the version's registered routes (from `parseVersionEntry`).
 * A registered `:param` segment matches anything in the same position — including the `*` a
 * template-literal hole was normalized to above. Returns the matching route, or null if the
 * destination isn't one of this version's own routes (an external / cross-version navigation).
 */
export function matchRoute(navPath, routes) {
    const segs = navPath.split("/").filter(Boolean);
    for (const route of routes) {
        const routeSegs = route.path.split("/").filter(Boolean);
        if (routeSegs.length !== segs.length) continue;
        if (routeSegs.every((rs, i) => rs.startsWith(":") || rs === segs[i])) return route;
    }
    return null;
}

// ── static-render limitations ───────────────────────────────────────────────
//
// Specifiers that mean "this component executes to produce its picture" — a live map, WebGL or
// canvas library. A design tool that reads code without running it has nothing to read here: the
// pixels only exist once the library runs against a real viewport/tile server. Flagging the file
// explicitly is honest; leaving it to render as inert JSX and saying nothing is not.
export const LIVE_RENDER_SPECS = [
    "mapbox-gl", "mapbox-gl-compare", "maplibre-gl", "react-map-gl",
    "leaflet", "three", "@react-three/fiber", "@react-three/drei",
    "pixi.js", "konva", "@deck.gl/core",
];

/** The subset of `LIVE_RENDER_SPECS` a source file imports, if any. */
export function liveRenderSpecsUsed(source) {
    const specs = new Set(parseImports(source).map((i) => i.spec));
    return LIVE_RENDER_SPECS.filter((s) => specs.has(s));
}

// ── reference-image registry ────────────────────────────────────────────────
//
// A human-supplied stand-in for the one thing this format cannot generate itself: the picture a
// live-render file (above) would only produce by actually running. See ../assets/README.md for
// how an entry gets added; this is deliberately data, not code, so adding a reference image never
// touches this script.

/** Read `<assetsDir>/registry.json`; an absent file (no images registered yet) is not an error. */
export function loadAssetRegistry(assetsDir) {
    const p = path.join(assetsDir, "registry.json");
    if (!existsSync(p)) return [];
    return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * Registry entries relevant to a file: at least one `matchSpecs` hit, and `matchPattern` (if set)
 * found in its source. An entry with `versions` serves only the version ids it lists: a file that
 * several versions share matches the same pattern in all of them, and one version's picture must
 * not attach to another's export. With no `version` given, a scoped entry never matches.
 */
export function matchRegistryEntries(registry, specsUsed, source, { version = null } = {}) {
    return registry.filter((entry) => {
        if (entry.versions !== undefined) {
            if (!Array.isArray(entry.versions) || !entry.versions.length || entry.versions.some((v) => typeof v !== "string")) {
                throw new Error(`registry.json entry "${entry.id}": "versions" must be a non-empty array of version ids, e.g. ["v1.0.0"]`);
            }
            if (!entry.versions.includes(version)) return false;
        }
        if (!(entry.matchSpecs ?? []).some((s) => specsUsed.includes(s))) return false;
        return !entry.matchPattern || new RegExp(entry.matchPattern).test(source);
    });
}

// ── import graph ────────────────────────────────────────────────────────────

/** Every `import ... from "<spec>"` in a source file, as { names, spec, isTypeOnly }. */
export function parseImports(source) {
    const out = [];
    // import X, { a, b } from "spec";  |  import "spec";  |  import type { T } from "spec";
    const re = /import\s+(type\s+)?(?:([^;'"]*?)\s+from\s+)?["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const isTypeOnly = Boolean(m[1]);
        const clause = m[2] ?? "";
        const names = [];
        const braced = /\{([^}]*)\}/.exec(clause);
        if (braced) {
            for (const raw of braced[1].split(",")) {
                const name = raw.trim().split(/\s+as\s+/)[0].trim().replace(/^type\s+/, "");
                if (name) names.push(name);
            }
        }
        const def = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
        if (def && !def.startsWith("*")) names.push(def);
        out.push({ names, spec: m[3], isTypeOnly });
    }
    return out;
}

/**
 * name → relative source path, parsed from a barrel `index.ts`:
 *   export { A, B } from "./components/X";
 *   export type { AProps } from "./components/X";
 * `export *` is intentionally not resolvable to a single name and is skipped.
 */
export function parseNamedExportMap(indexSource) {
    const map = new Map();
    const re = /export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(indexSource)) !== null) {
        const from = m[2];
        for (const raw of m[1].split(",")) {
            const name = raw.trim().split(/\s+as\s+/).pop().trim();
            if (name) map.set(name, from);
        }
    }
    return map;
}

/**
 * Every module specifier a source file depends on: static imports (named, default, side-effect),
 * `export … from` re-exports and dynamic `import("…")`. Comments excluded. For a stylesheet, its
 * `@import`s. `parseImports` answers *which names*; this answers *which files*, and a barrel that
 * only re-exports is invisible to the former.
 */
export function importSpecs(source, { css = false } = {}) {
    const out = new Set();
    if (css) {
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const m of code.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) out.add(m[1]);
        return [...out];
    }
    const code = maskSource(source);
    for (const m of code.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']/g)) out.add(m[1]);
    for (const m of code.matchAll(/\bimport\(\s*["'`]([^"'`$]+)["'`]\s*\)/g)) out.add(m[1]);
    return [...out];
}

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/**
 * Resolve a relative import spec against a file: the exact file (a stylesheet, an image), then
 * the TypeScript/JavaScript extensions (a `.js` spec also tries `.ts`/`.tsx`, as TS emits), then
 * `/index.*`. Confined to `roots`; null when it resolves nowhere or outside them.
 */
function resolveLocal(fromFile, spec, roots) {
    if (!spec.startsWith(".")) return null;
    const exact = path.resolve(path.dirname(fromFile), spec);
    const base = path.resolve(path.dirname(fromFile), spec.replace(/\.(js|jsx|mjs)$/, ""));
    const candidates = [
        exact,
        ...SOURCE_EXTS.map((e) => base + e),
        ...SOURCE_EXTS.map((e) => path.join(base, `index${e}`)),
    ];
    for (const c of candidates) {
        if (existsSync(c) && statSync(c).isFile()) {
            return roots.some((root) => isInside(c, root)) ? c : null;
        }
    }
    return null;
}

/** Whether `file` is `root` or below it — a prefix test that `/src-old` cannot fool. */
function isInside(file, root) {
    const rel = path.relative(root, file);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Starting from a set of DS source entry files, follow relative imports transitively and return
 * every source file reached, confined to the given roots. `dsRoot` bounds the walk to <ds>/src.
 */
export function collectTransitive(entryFiles, dsSrcRoot) {
    const roots = [dsSrcRoot];
    const seen = new Set();
    const stack = [...entryFiles];
    while (stack.length) {
        const file = stack.pop();
        if (seen.has(file) || !existsSync(file)) continue;
        seen.add(file);
        if (!/\.(ts|tsx|js|jsx|mjs|css)$/.test(file)) continue;
        const src = readFileSync(file, "utf8");
        for (const spec of importSpecs(src, { css: file.endsWith(".css") })) {
            const resolved = resolveLocal(file, spec, roots);
            if (resolved && !seen.has(resolved)) stack.push(resolved);
        }
    }
    return [...seen];
}

// ── the production import graph ─────────────────────────────────────────────
//
// A design version is one folder by construction (docs/design-folder.md). A production version is
// not: its screens reach across the frontend's views/, infra/, utils/ and whatever else the app
// grew, and copying `pages/<v>/` alone would ship screens whose every relative import points at
// nothing. So the production mode walks the real import graph from the entry's routes, and keeps
// every file at its path under the frontend's src/ so each import in the copy still resolves.

/** Test code, fixtures for tests and stories: never part of what a user is served. */
export function isTestFile(file) {
    const f = file.split(path.sep).join("/");
    return /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(f) || /\/(testing|__tests__|__mocks__)\//.test(f);
}

/**
 * Walk relative imports from `entries`, staying inside `root`, tests excluded. Returns
 * { files, external: Map<bare spec, Set<imported name>>, outside: [{ from, spec }] } — `external`
 * is what the design-system resolution reads; `outside` is a relative import that resolved to
 * nothing inside `root` (a file outside the frontend, or a typo), reported rather than guessed.
 */
export function walkImportGraph(entries, root, { exclude = isTestFile } = {}) {
    const seen = new Set();
    const external = new Map();
    const outside = [];
    const stack = [...entries];
    while (stack.length) {
        const file = stack.pop();
        if (seen.has(file) || !isInside(file, root) || exclude(file) || !existsSync(file)) continue;
        seen.add(file);
        const isCss = file.endsWith(".css");
        if (!isCss && !/\.[cm]?[jt]sx?$/.test(file)) continue;
        const source = readFileSync(file, "utf8");
        if (!isCss) {
            for (const imp of parseImports(maskSource(source))) {
                if (imp.spec.startsWith(".")) continue;
                if (!external.has(imp.spec)) external.set(imp.spec, new Set());
                imp.names.forEach((n) => external.get(imp.spec).add(n));
            }
        }
        for (const spec of importSpecs(source, { css: isCss })) {
            if (!spec.startsWith(".")) {
                if (isCss && !external.has(spec)) external.set(spec, new Set());
                continue;
            }
            const hit = resolveLocal(file, spec, [root]);
            if (hit) {
                if (!seen.has(hit)) stack.push(hit);
            } else {
                outside.push({ from: file, spec });
            }
        }
    }
    return { files: [...seen].sort(), external, outside };
}

/**
 * name → source file for a barrel, following named re-exports AND `export * from` recursively
 * (cycle-safe). The DS's `staging/index.ts` is exactly one `export * from "./vX.Y.Z/index"` line —
 * the newest-staging alias — so a barrel parser that skips `export *` resolves nothing a bare
 * `…/staging` import names.
 */
export function buildExportMap(indexFile, roots) {
    const map = new Map();
    const visited = new Set();
    const visit = (file) => {
        if (visited.has(file) || !existsSync(file)) return;
        visited.add(file);
        const src = maskSource(readFileSync(file, "utf8"));
        for (const [name, rel] of parseNamedExportMap(src)) {
            const hit = resolveLocal(file, rel, roots);
            if (hit && !map.has(name)) map.set(name, hit);
        }
        for (const m of src.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
            const hit = resolveLocal(file, m[1], roots);
            if (hit) visit(hit);
        }
    };
    visit(indexFile);
    return map;
}

/**
 * Which design-system components a set of imports names, and the source files they live in.
 *
 *   importsBySpec   Map<spec, Iterable<name>> — every bare import the version makes
 *   dsName          the name imports spell the design system with (DS_PACKAGE_NAME)
 *   dsSrc           <DS_REPO_PATH>/src, or null when no source tree is available
 *
 * `<dsName>` resolves through src/index.ts, `<dsName>/staging` through src/staging/index.ts (the
 * newest-staging alias) and `<dsName>/staging/<v>` through src/staging/<v>/index.ts. Stylesheet
 * subpaths name no component and are skipped. Returns { shipped, staging, stagingVersion,
 * entryFiles, unresolved } — `unresolved` is every name no barrel exports, reported, not dropped.
 */
export function resolveDsImports(importsBySpec, dsName, dsSrc) {
    const shipped = new Set();
    const staging = new Set();
    let stagingVersion = null;
    const entryFiles = [];
    const unresolved = [];
    const maps = new Map();
    const mapFor = (indexRel) => {
        if (!maps.has(indexRel)) {
            const index = dsSrc ? path.join(dsSrc, indexRel) : null;
            maps.set(indexRel, index && existsSync(index) ? buildExportMap(index, [dsSrc]) : null);
        }
        return maps.get(indexRel);
    };
    for (const [spec, names] of importsBySpec) {
        let indexRel;
        let bucket;
        if (spec === dsName) { indexRel = "index.ts"; bucket = shipped; }
        else if (spec === `${dsName}/staging`) { indexRel = path.join("staging", "index.ts"); bucket = staging; }
        else if (spec.startsWith(`${dsName}/staging/`)) {
            const v = spec.slice(`${dsName}/staging/`.length);
            if (v.endsWith(".css")) continue;
            stagingVersion = v;
            indexRel = path.join("staging", v, "index.ts");
            bucket = staging;
        } else continue;
        const map = mapFor(indexRel);
        for (const name of names) {
            bucket.add(name);
            if (!dsSrc) continue; // no source tree: names only, reported as such by the caller
            const file = map?.get(name);
            if (file) entryFiles.push(file);
            else unresolved.push(`${name} (${spec})`);
        }
    }
    return {
        shipped: [...shipped].sort(),
        staging: [...staging].sort(),
        stagingVersion,
        entryFiles: [...new Set(entryFiles)],
        unresolved,
    };
}

// ── what a screen asks the API for ──────────────────────────────────────────

/**
 * Root-relative request paths a source passes to an API client, `${…}` holes shown as `{…}`.
 *
 * A heuristic, and labelled as one wherever it is shown: a call counts when its callee's name
 * contains `api`, `fetch` or `request` (apiJson, apiClient, publicApiClient, fetch, request…) and
 * its path is a literal starting with `/`: the first argument, or the first literal after at most
 * two plain leading arguments — an identifier or member chain, optionally `!` — so a client that
 * takes a credential before the path (`shareRequest(token, "/shared-plan")`) is read too. Any
 * other leading argument (a call, an object, a literal) ends the search. It lists what a screen
 * CAN call — reads, and the writes its controls make — not what it renders on first paint.
 */
export function apiCallsIn(source) {
    const out = new Set();
    const code = maskSource(source);
    const lead = String.raw`(?:[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*!?\s*,\s*){0,2}`;
    const re = new RegExp(String.raw`\b([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*(?:<[^<>()]*>[^<>()]*)*>)?\(\s*` + lead + "(`[^`]*`|\"[^\"]*\"|'[^']*')", "g");
    for (const m of code.matchAll(re)) {
        if (!/api|fetch|request/i.test(m[1])) continue;
        const raw = m[2].slice(1, -1);
        if (!raw.startsWith("/") || raw.startsWith("//")) continue;
        out.add(m[2][0] === "`" ? raw.replace(/\$\{[^}]*\}/g, "{…}") : raw);
    }
    return [...out].sort();
}

// ── finding the design system's source tree ─────────────────────────────────

/**
 * The main checkout of the repository `startDir` is in, read from the filesystem exactly as
 * `git rev-parse --path-format=absolute --git-common-dir` computes it — without shelling out,
 * which this exporter never does.
 *
 * In a linked worktree `.git` is a FILE (`gitdir: <main>/.git/worktrees/<name>`), and that
 * directory's `commondir` names the shared `.git`, whose parent is the main checkout. Returns
 * { worktreeRoot, mainRoot } — equal in an ordinary checkout — or null outside any repository
 * (and mainRoot null for a bare common dir).
 */
export function findMainCheckout(startDir) {
    let dir = path.resolve(startDir);
    for (;;) {
        const dotGit = path.join(dir, ".git");
        if (existsSync(dotGit)) {
            if (statSync(dotGit).isDirectory()) return { worktreeRoot: dir, mainRoot: dir };
            const gitdirLine = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
            if (!gitdirLine) return null;
            const gitdir = path.resolve(dir, gitdirLine[1].trim());
            const commondirFile = path.join(gitdir, "commondir");
            const common = existsSync(commondirFile)
                ? path.resolve(gitdir, readFileSync(commondirFile, "utf8").trim())
                : gitdir;
            return { worktreeRoot: dir, mainRoot: path.basename(common) === ".git" ? path.dirname(common) : null };
        }
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/** A design-system SOURCE tree: `package.json` and `src/`. */
export function isDsSourceTree(dir) {
    return Boolean(dir) && existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "src"))
        && statSync(path.join(dir, "src")).isDirectory();
}

/**
 * Resolve DS_REPO_PATH to a source tree. An absolute path is taken as given. A relative one —
 * the binding is written relative to the checkout, `../design-system-uds` — is tried against
 * `cwd` first, and then, when `cwd` is inside a LINKED WORKTREE, against the same place relative
 * to the main checkout: a sibling of the main checkout is not a sibling of `C:/tmp/<worktree>`.
 * Returns { root, tried } — root null when no candidate is a source tree, and `tried` is what
 * the caller's error lists.
 */
export function resolveDsRepoPath(given, { cwd = process.cwd() } = {}) {
    if (!given) return { root: null, tried: [] };
    const tried = [];
    const first = path.resolve(cwd, given);
    tried.push(first);
    if (isDsSourceTree(first)) return { root: first, tried };
    if (!path.isAbsolute(given)) {
        const repo = findMainCheckout(cwd);
        if (repo?.mainRoot && path.resolve(repo.mainRoot) !== path.resolve(repo.worktreeRoot)) {
            const fromMain = path.resolve(repo.mainRoot, path.relative(repo.worktreeRoot, path.resolve(cwd)), given);
            tried.push(fromMain);
            if (isDsSourceTree(fromMain)) return { root: fromMain, tried };
        }
    }
    return { root: null, tried };
}

/**
 * The INSTALLED design-system package, found the way Node would — `node_modules/<name>` in the
 * frontend or any directory above it. Only the production mode reads it, and only when no source
 * tree is available: it ships `dist/`, so it can name the components a screen uses and supply the
 * token stylesheet, and cannot supply a single component's source.
 */
export function findInstalledPackage(fromDir, name) {
    let dir = path.resolve(fromDir);
    for (;;) {
        const pkg = path.join(dir, "node_modules", ...name.split("/"));
        if (existsSync(path.join(pkg, "package.json"))) return pkg;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/** The installed package's built stylesheet: its `./index.css` export, else dist/index.css. */
function installedStylesheet(pkgDir) {
    const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
    const exp = pkg.exports?.["./index.css"];
    const rel = typeof exp === "string" ? exp : exp?.default ?? exp?.import ?? "./dist/index.css";
    const file = path.resolve(pkgDir, rel);
    return existsSync(file) ? file : null;
}

// ── recorded API answers (a wired version's mock data) ──────────────────────

/**
 * Read a fixtures directory written by capture-fixtures.mjs (and, optionally, curate-fixtures.mjs):
 * `index.json` plus one JSON file per recorded answer. Returns null when the directory holds no
 * index — the caller decides what "none" means — or { index, entries, missing }, where `entries`
 * is [{ resource, status, file, abs, curated }] for files present and `missing` names the index
 * lines whose file is gone.
 */
export function loadFixtures(dir) {
    const indexPath = dir ? path.join(dir, "index.json") : null;
    if (!indexPath || !existsSync(indexPath)) return null;
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const entries = [];
    const missing = [];
    for (const [resource, rec] of Object.entries(index.responses ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        const abs = path.join(dir, rec.file);
        if (existsSync(abs)) entries.push({ resource, status: rec.status, file: rec.file, abs, curated: Boolean(rec.curated) });
        else missing.push(resource);
    }
    return { index, entries, missing };
}

// ── static assets ─────────────────────────────────────────────────────────────

/**
 * Find the root-absolute static asset references in a source file — the ones the import graph
 * never sees. Two forms reach a file in the frontend's `public/` at runtime:
 *
 *   <img src="/umovity-logo.png">           JSX / HTML attribute
 *   background: url(/pattern.svg);           CSS url()
 *
 * Both are plain strings, not `import`s, so `collectTransitive` (which walks imports) is blind to
 * them and the asset is silently dropped from the export — the exact gap that left the Umovity
 * logo out. We deliberately match ONLY root-absolute `/…` references: those resolve against
 * `public/`. A relative or bare-specifier asset (`./logo.png`, `~/foo`) is an import and is
 * already handled by the import walk; an `http(s)://` or `data:` URL needs no copying.
 *
 * Returns a Set of posix-style paths relative to `public/` (e.g. "umovity-logo.png").
 */
export function parseAssetRefs(source) {
    const refs = new Set();
    // src="/x", href="/x" (attribute form) — quote-delimited, root-absolute, not "//host".
    const attrRe = /(?:src|href)\s*=\s*["'](\/[^"'/][^"']*)["']/g;
    // url(/x) — CSS, optional quotes inside the parens, root-absolute, not "//host".
    const urlRe = /url\(\s*["']?(\/[^"')/][^"')]*)["']?\s*\)/g;
    for (const re of [attrRe, urlRe]) {
        let m;
        while ((m = re.exec(source)) !== null) {
            // Strip a query/hash suffix (e.g. "/logo.png?v=2") — the file on disk has neither.
            const clean = m[1].split(/[?#]/)[0];
            if (clean.length > 1) refs.add(clean.replace(/^\/+/, ""));
        }
    }
    return refs;
}

/**
 * Scan every copied source file (version screens/components/data + resolved DS sources) for
 * root-absolute asset references and resolve each against the frontend's `public/` directory.
 * Returns [{ rel, file }] for those that exist on disk; a reference to a missing file is reported
 * by the caller (a real finding, per prompt 04's rules — not papered over).
 */
export function collectPublicAssets(sourceFiles, publicDir) {
    const refs = new Set();
    for (const file of sourceFiles) {
        if (!/\.(ts|tsx|js|jsx|css|md)$/.test(file) || !existsSync(file)) continue;
        for (const ref of parseAssetRefs(readFileSync(file, "utf8"))) refs.add(ref);
    }
    const found = [];
    const missing = [];
    for (const rel of [...refs].sort()) {
        const abs = path.join(publicDir, rel.split("/").join(path.sep));
        if (existsSync(abs) && statSync(abs).isFile()) found.push({ rel, file: abs });
        else missing.push(rel);
    }
    return { found, missing };
}

/**
 * Rewrite root-absolute asset references (`src="/x"`, `url(/x)`) in a copied source file so they
 * point at the zip-local copy instead of a server path. The exported tree has no server behind
 * it — a design tool reading `src="/umovity-logo.png"` verbatim has nothing to resolve it against,
 * so a copy in `assets/` that nothing points to is as good as a missing one.
 *
 * `resolve(cleanRef)` maps a de-querystringed, leading-slash-stripped ref (e.g. "umovity-logo.png")
 * to its replacement string, or returns null/undefined to leave the reference untouched (a ref
 * with no matching copied asset — already reported separately as missing).
 */
export function rewriteAssetRefs(source, resolve) {
    const apply = (raw) => {
        const clean = raw.split(/[?#]/)[0].replace(/^\/+/, "");
        return resolve(clean);
    };
    let out = source.replace(
        /((?:src|href)\s*=\s*)(["'])(\/[^"'/][^"']*)\2/g,
        (m, pre, q, ref) => {
            const rel = apply(ref);
            return rel == null ? m : `${pre}${q}${rel}${q}`;
        },
    );
    out = out.replace(
        /(url\(\s*)(["']?)(\/[^"')/][^"')]*)\2(\s*\))/g,
        (m, pre, q, ref, post) => {
            const rel = apply(ref);
            return rel == null ? m : `${pre}${q}${rel}${q}${post}`;
        },
    );
    return out;
}

// ── token map ───────────────────────────────────────────────────────────────

/** Extract the design-system token declarations from index.css (raw custom properties). */
export function extractTokens(indexCss) {
    const lines = [];
    const re = /(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(indexCss)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        lines.push(`  ${m[1]}: ${m[2].trim()};`);
    }
    return lines;
}

// ── store-only ZIP writer ───────────────────────────────────────────────────
// Method 0 (stored). No external dependency, no shell-out. Enough for a readable source tree.

function crc32(buf) {
    let crc = ~0;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (~crc) >>> 0;
}

export function zipStore(entries) {
    // entries: [{ name, data: Buffer }]  — name uses forward slashes.
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, "utf8");
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);   // local file header signature
        local.writeUInt16LE(20, 4);            // version needed
        local.writeUInt16LE(0, 6);             // flags
        local.writeUInt16LE(0, 8);             // method 0 = stored
        local.writeUInt16LE(0, 10);            // mod time
        local.writeUInt16LE(0x21, 12);         // mod date (arbitrary, fixed for determinism)
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);  // compressed size == size
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        chunks.push(local, nameBuf, data);

        const cen = Buffer.alloc(46);
        cen.writeUInt32LE(0x02014b50, 0);      // central directory signature
        cen.writeUInt16LE(20, 4);              // version made by
        cen.writeUInt16LE(20, 6);              // version needed
        cen.writeUInt16LE(0, 8);
        cen.writeUInt16LE(0, 10);
        cen.writeUInt16LE(0, 12);
        cen.writeUInt16LE(0x21, 14);
        cen.writeUInt32LE(crc, 16);
        cen.writeUInt32LE(data.length, 20);
        cen.writeUInt32LE(data.length, 24);
        cen.writeUInt16LE(nameBuf.length, 28);
        cen.writeUInt16LE(0, 30);
        cen.writeUInt16LE(0, 32);
        cen.writeUInt16LE(0, 34);
        cen.writeUInt16LE(0, 36);
        cen.writeUInt32LE(0, 38);
        cen.writeUInt32LE(offset, 42);
        central.push(cen, nameBuf);
        offset += local.length + nameBuf.length + data.length;
    }
    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...chunks, centralBuf, end]);
}

// ── README generation ───────────────────────────────────────────────────────

export function buildReadme(entry, {
    shipped, staging, stagingVersion, assets = [], flows = [],
    referenceImages = [], unresolvedLiveRender = [], assetsDirLabel = null,
}) {
    const assetsDirText = assetsDirLabel ?? "the assets directory (design-commands/assets; not given for this export)";
    const rows = entry.routes
        .map((r) => `| \`${r.path || "(entry)"}\` | ${r.component} |`)
        .join("\n");
    const list = (arr) => (arr.length ? arr.map((n) => `- ${n}`).join("\n") : "- (none)");
    const mountPrefix = entry.kind === "design" ? `/design/${entry.id}` : `/${entry.id}`;
    const flowRows = flows
        .map((f) => `| \`${f.from}\` | \`${f.navPath || "(root)"}\` | ${f.to ? `\`${f.routePath || "(entry)"}\` → ${f.to}` : "_unresolved — not one of this version's own routes_"} |`)
        .join("\n");
    const referenceImageRows = referenceImages
        .map((r) => `| \`${r.exportAs}\` | ${r.description} | ${r.files.map((f) => `\`${f}\``).join(", ")} |`)
        .join("\n");
    const unresolvedLiveRenderRows = unresolvedLiveRender
        .map((f) => `| \`${f.file}\` | ${f.specs.join(", ")} |`)
        .join("\n");
    return `# ${entry.id} — design export

${entry.label ?? entry.id}

- **kind:** ${entry.kind ?? "?"}
- **wired:** ${entry.wired === true ? "yes — this version talks to real backends" : "no — mocked"}
- **entry point:** \`${entry.entryRoute || "(root)"}\`

This is a **readable source tree**, not a runnable application. The design tool reads the code and
rebuilds these screens as editable design components with the tokens wired in as properties. There
is no build step, no entry point and no screenshots here on purpose.

## Screens (route graph)

Paths are relative to the version's own base — the app adds the \`${mountPrefix}\` prefix when it
mounts. No path here carries a version prefix.

| Route | Screen |
|---|---|
${rows || "| (none parsed) | |"}

## Flows (where in-app navigation actually leads)

Every \`nav(...)\` call found in this version's own source, resolved against the route table above.
A dynamic destination — \`nav(\`/project/\${event.id}\`)\` — carries no readable string to match a
screen by eye or by name; a guess from a button's label can land on the wrong one silently (a
"Draft briefing" button does not necessarily lead to the briefing screen). This table is a fact,
not a guess — read it before assuming what a button leads to.

| From | Calls \`nav(...)\` with | Resolves to |
|---|---|---|
${flowRows || "| (no in-app navigation calls found) | | |"}

## What this export cannot show

This tree is static and never executes, so it has no way to run the interaction that produces
either category below by itself. That does not mean the design tool can't reconstruct the real
behavior — see "If the design tool guesses wrong" for how, in practice, telling it the interaction
directly gets it built (confirmed for a click-to-expand accordion and a map-swipe control, neither
of which is visible anywhere in this static tree). Absent that instruction, expect:

- **Runtime-only visual states.** An accordion, tab set, hover state or anything else gated behind
  local component state renders here only in its default, as-mounted state (usually closed/
  collapsed) — the code for the other states is present in the same file's conditional branches,
  it is just not "on screen" in a non-executing read. The fix is not to force the other state open
  as a permanent replacement — that loses the real interaction — it's to describe the interaction
  itself (closed by default, opens on click) so the design tool builds a genuinely clickable
  element instead of a frozen snapshot. Check the component's source for the condition (the state
  variable and what it gates) to name it precisely, or open the live preview and trigger it for
  real to see what "open" should look like.
- **Live-rendered content** (a map, WebGL or canvas view): the pixels only exist once the library
  actually runs against a real viewport, tile server or GPU context — there is nothing for a
  non-executing reader to show. Flagged here by import, not guessed. A file below with a reference
  image was matched against \`${assetsDirText}/registry.json\` and a human-supplied static capture
  was copied in for it (see that entry's own description for what it does and does not show); a
  file with none has no static stand-in yet.

**Reference images included** (copied from the registry):

| Included at | What it shows | Stands in for |
|---|---|---|
${referenceImageRows || "| (none) | | |"}

**Live-render files with no reference image yet:**

| File | Live-render library import |
|---|---|
${unresolvedLiveRenderRows || "| (none) | |"}

If the designer needs a static picture of one of these, see \`${assetsDirText}/README.md\` — a
supplied image gets registered once and is reused by every future export, not just this one.

## If the design tool guesses wrong — say so explicitly

A tool reconstructing these screens does not execute the code, so for anything above it had to
infer rather than run, it may default to a guess instead of reading this file. Confirmed in
practice: it does not reliably self-correct from the tables above on its own, but it reliably does
when told directly, in plain language, what should happen instead. If what you see doesn't match
this README, say so directly rather than re-reading the table and hoping it updates itself:

- **Wrong navigation target** (disagrees with the Flows table above): "Wire \`<screen>\`'s
  \`<action>\` to open \`<the correct screen>\` (\`<route>\`), not \`<the screen it guessed>\`."
- **A runtime-only visual state** (an accordion, tab set, etc. — see above): ask for the real
  *interaction*, not a frozen replacement state. "Make \`<component>\`'s \`<accordion/steps/panel>\`
  a real click-to-expand element — closed by default, expanding when clicked" — not "render it
  expanded," which only trades one static picture for another and loses the click entirely.
- **A live-rendered element missing or blank** (a map/canvas/WebGL view with no reference image
  above): describe the intended interaction directly — "\`<file>\`'s two maps are a synced
  swipe/compare view built with mapbox-gl-compare; render them as two panels with a draggable
  divider" is the kind of sentence that has worked, confirmed empirically, even with no picture
  supplied for it at all.

## How to read the tree

| Folder | What is in it |
|---|---|
| \`screens/\` | the version's screens, one file per screen (plus any stage/step sub-screens) |
| \`components/\` | composites specific to this version |
| \`design-system/\` | the shipped and staging design-system components this version actually imports, in **source** form |
| \`tokens/\` | the design-system token map — colour, typography, spacing, elevation |
| \`data/\` | mock data, so a screen can be read in context |
| \`assets/\` | static files a screen references by root-absolute URL (\`src="/logo.png"\`), copied from the app's \`public/\`. A reference like \`src="/umovity-logo.png"\` maps to \`assets/umovity-logo.png\` here — the leading \`/\` becomes the \`assets/\` folder. |

## Design-system components used

Resolved from the imports this version actually makes, transitively, from source${stagingVersion ? ` (staging version \`${stagingVersion}\`)` : ""
        }.

**Shipped:**
${list(shipped)}

**Staging:**
${list(staging)}

## Static assets

Files referenced by a screen as a root-absolute URL (\`src="/…"\`, \`url(/…)\`) rather than an import,
copied from the app's \`public/\` into \`assets/\`. A screen's \`/foo.png\` is \`assets/foo.png\` here.

${list(assets)}

---

_Generated by \`export-design-version.mjs\`. Pure copy of source — nothing here was rendered or
executed._
`;
}
// ── README generation: the production mode ──────────────────────────────────

/**
 * What the export says about mock data. For a production version this is never left implicit:
 * the reader is told whether recorded answers are here, and when they are not, why not.
 *
 *   fixtures   the loadFixtures() result, or null
 *   state      "included" | "unbound" (no --fixtures: the host binds no FIXTURES_DIR)
 *              | "empty" (bound, but nothing recorded for this version)
 */
export function mockDataSection(entry, { fixtures = null, state, fixturesLabel = null }) {
    const wiredLine = entry.wired === false
        ? `This production entry is \`wired: false\`: whatever data its screens show is in the source tree itself, under \`src/\`.`
        : `This version is \`wired: true\`: every figure its screens show arrives from the API at runtime, so its source carries no mock data of its own.`;
    if (state === "included" && fixtures) {
        const idx = fixtures.index;
        const notes = idx.curated?.notes ?? [];
        const errors = fixtures.entries.filter((e) => e.status >= 400);
        return `${wiredLine}

\`data/api/\` holds **${fixtures.entries.length} API answer(s) recorded by the host from a running local stack**${idx.recordedAt ? ` on ${idx.recordedAt}` : ""}${idx.subject ? ` — ${idx.subject}` : ""}. They were not written by hand: each is what the API answered to a \`GET\`, so its shape is the API contract by construction.

\`data/mock-api.json\` maps each request a screen makes — \`GET ${idx.apiPrefix ?? ""}<resource>\`, the path the app actually sends — to its recorded status and file. To show a screen with data, answer its calls from that table; the *reachable API calls* column above says which calls each screen can make. \`data/index.json\` is the host's own fixtures index, verbatim.

${notes.length
        ? `**Curated.** After recording, the host applied declared edits that remove artefacts of a development database. None changes a figure. In the host's own words:\n\n${notes.map((n) => `- ${n}`).join("\n")}`
        : "**Not curated.** Every answer is exactly as recorded."}
${errors.length ? `\n**Recorded as errors** (the API answered an error status; the answer is kept, not hidden): ${errors.map((e) => `\`${e.resource}\` (${e.status})`).join(", ")}.\n` : ""}${fixtures.missing.length ? `\n**Listed in the index but missing on disk, so not included:** ${fixtures.missing.map((r) => `\`${r}\``).join(", ")}.\n` : ""}
**Never recorded:** anything a \`GET\` cannot produce — the answers to writes, and anything that needed one to exist.`;
    }
    if (state === "empty") {
        return `${wiredLine}

**None included.** The host binds a fixtures source${fixturesLabel ? ` (\`${fixturesLabel}\`)` : ""}, but it holds no recorded answers for \`${entry.id}\`. Record them with the host's \`FIXTURE_CAPTURE_CMD\` against a running local stack and export again. Until then, a screen here shows only its code; the *reachable API calls* column above says which requests it makes.`;
    }
    return `${wiredLine}

**None included, deliberately.** This host binds no fixtures source (\`FIXTURES_DIR\` is \`null\`), so there are no recorded API answers to ship, and none were invented: a hand-written mock of a wired screen drifts from the API contract the day a field moves. A screen here shows only its code; the *reachable API calls* column above says which requests it makes.`;
}

export function buildProductionReadme({
    entry, frontendLabel = "the frontend package", fileCount = 0,
    routeRows = [], shellRows = [], flows = [],
    ds = { mode: "source", shipped: [], staging: [], stagingVersion: null, dsName: "the design system", unresolved: [] },
    assets = [], referenceImages = [], unresolvedLiveRender = [], assetsDirLabel = null,
    mockData = "", outside = [],
}) {
    const list = (arr) => (arr.length ? arr.map((n) => `- ${n}`).join("\n") : "- (none)");
    const cell = (calls) => (calls.length ? calls.map((c) => `\`${c}\``).join("<br>") : "—");
    const assetsDirText = assetsDirLabel ?? "the assets directory (not given for this export)";
    const routes = routeRows
        .map((r) => `| \`${r.path || "(entry)"}\` | ${r.component} | \`${r.file}\` | ${r.guard ?? "?"} | ${cell(r.calls)} |`)
        .join("\n");
    const shell = shellRows
        .map((r) => `| \`${r.path}\` | ${r.component ?? "—"} | \`${r.file}\` | ${cell(r.calls)} |`)
        .join("\n");
    const flowRows = flows
        .map((f) => `| \`${f.from}\` | \`${f.navPath || "/"}\` | ${f.to ? `\`${f.routePath || "(entry)"}\` → ${f.to}` : "_not one of this version's routes or declared shell screens_"} |`)
        .join("\n");
    const dsFolder = ds.mode === "source"
        ? `the \`${ds.dsName}\` components these screens import, in **source** form, at their paths under the design system's \`src/\`. \`${ds.dsName}\` is \`design-system/index.ts\`; \`${ds.dsName}/staging\` is \`design-system/staging/index.ts\`. The barrels are copied so the mapping reads; a file a barrel names that is not here is one these screens do not use`
        : `**not included.** No design-system source tree was available to this export (\`DS_REPO_PATH\`), so the components below are named but their source is not here — the installed package ships only \`dist/\`, bundled output a design tool should not be asked to read. The token map still comes from the installed package's stylesheet`;
    return `# ${entry.id} — production export

${entry.label ?? entry.id} · production entry · \`wired: ${entry.wired}\` · ${fileCount} source file(s)

This is what the registry's **production** entry \`${entry.id}\` serves — its screens and every file
they reach — as a **readable source tree**, not a runnable application. It was exported from the
production entry directly, with no \`-tech\` revision in between. There is no build, no entry point
and no \`package.json\` on purpose: the design tool reads the code and rebuilds the screens as
editable components.

**How this differs from a design-version export.** A design version is one folder and carries its
mock data beside its screens. A production version is neither: its screens reach across the whole
frontend, so \`src/\` holds the real files, untouched and at their real paths, and the mock data —
if there is any — is recorded, not written. See *Mock data* below.

## How to read the tree

| Folder | What is in it |
|---|---|
| \`src/\` | the files these screens reach in ${frontendLabel}'s \`src/\`, **at their real paths**, so every relative import in the copy resolves. Tests, test helpers and stories are excluded |
| \`design-system/\` | ${dsFolder} |
| \`tokens/\` | \`tokens.css\`, the design system's custom properties${ds.mode === "source" ? ", and `design-system/`, its token source files" : ""}. The app's own stylesheet is in \`src/\`, where it is imported from |
| \`data/\` | recorded API answers, when the host supplies them — see *Mock data* |
| \`assets/\` | files a screen references by root URL (\`/logo.png\` → \`assets/logo.png\`), re-pointed at this copy; \`assets/reference/\` holds any reference image from ${assetsDirText} |

## Screens and routes

Paths are relative to the version's mount: the public version is served at \`/\`, and an
administrator can also reach it at \`/${entry.id}/\`. No path here carries a version prefix.

| Route | Screen | Source | Guard | Reachable API calls |
|---|---|---|---|---|
${routes || "| (none parsed) | | | | |"}

**App-shell screens** a user's journey passes through — declared by the host, not owned by the
version, but part of what a user sees:

| Route | Screen | Source | Reachable API calls |
|---|---|---|---|
${shell || "| (none declared) | | | |"}

*Reachable* is every request in the screen's import graph — the reads it renders from **and the
writes its controls make** — so it is what a screen can ask for, not what it shows on first paint.
It is found by a heuristic: a call whose callee's name contains \`api\`, \`fetch\` or \`request\`,
with a literal path as its first argument, or after at most two plain leading arguments (a token,
say). A path built at runtime is not listed.

## Flows (where in-app navigation actually leads)

Every \`nav(…)\`, \`navigate(…)\` and \`<VersionLink to=…>\` found in the copied source — comments
excluded — resolved against the routes and shell screens above. Trust this table over a button's
label.

| From | Navigates to | Resolves to |
|---|---|---|
${flowRows || "| (no in-app navigation calls found) | | |"}

## What this export cannot show

It never executes, so a state behind local component state (an accordion, a tab, a hover) appears
only in its default, and a live-rendered view (a map, WebGL, canvas) has no pixels at all. Describe
the interaction to the design tool rather than asking for a frozen state; for live-rendered content
a reference image is copied in where ${assetsDirText}/registry.json has one.

**Reference images included:**

| Included at | What it shows | Stands in for |
|---|---|---|
${referenceImages.map((r) => `| \`${r.exportAs}\` | ${r.description} | ${r.files.map((f) => `\`${f}\``).join(", ")} |`).join("\n") || "| (none) | | |"}

**Live-render files with no reference image yet:**

| File | Live-render library import |
|---|---|
${unresolvedLiveRender.map((f) => `| \`${f.file}\` | ${f.specs.join(", ")} |`).join("\n") || "| (none) | |"}

## Mock data

${mockData}

## Design-system components used

${ds.mode === "source"
        ? `Resolved from the imports these screens actually make, transitively, from source${ds.stagingVersion ? ` (staging version \`${ds.stagingVersion}\`)` : ""}.`
        : "Named from the imports these screens make. **Their source is not in this export** — see `design-system/` above."}

**Shipped (\`${ds.dsName}\`):**
${list(ds.shipped)}

**Staging (\`${ds.dsName}/staging\`):**
${list(ds.staging)}
${ds.unresolved?.length ? `\n**Named by an import but exported by no barrel** (not copied): ${ds.unresolved.join(", ")}\n` : ""}
## Static assets

${list(assets)}
${outside.length ? `\n## Imports this export could not follow\n\nRelative imports that resolve to nothing inside the frontend's \`src/\`. The importing file is here; what it imports is not.\n\n${outside.map((o) => `- \`${o.from}\` → \`${o.spec}\``).join("\n")}\n` : ""}
## If the design tool guesses wrong — say so explicitly

- **A wrong destination:** "Wire \`<screen>\`'s \`<button>\` to \`<route>\`, per the Flows table."
- **A frozen accordion, tab, stepper or panel:** ask for the real interaction — "closed by default,
  opens on click" — never for a different frozen state.
- **A blank live-rendered view:** describe what it is and how it behaves, and point at its
  reference image if one is listed above.

---

_Generated by \`export-design-version.mjs --mode production\`. A pure copy of source and recorded
data — nothing here was built, rendered or executed._
`;
}

// ── copy helpers ────────────────────────────────────────────────────────────

function copyVersionTree(versionDir, outDir) {
    // components/ -> components/, data/ -> data/, everything else -> screens/. A version's own
    // `screens/` subdir merges into the export's screens/ (no screens/screens/); other subdirs
    // (e.g. stages/) keep their name under screens/ so nothing collides.
    const screensDir = path.join(outDir, "screens");
    for (const ent of readdirSync(versionDir, { withFileTypes: true })) {
        const src = path.join(versionDir, ent.name);
        if (ent.isDirectory() && ent.name === "components") {
            cpSync(src, path.join(outDir, "components"), { recursive: true });
        } else if (ent.isDirectory() && ent.name === "data") {
            cpSync(src, path.join(outDir, "data"), { recursive: true });
        } else if (ent.isDirectory() && ent.name === "screens") {
            mkdirSync(screensDir, { recursive: true });
            cpSync(src, screensDir, { recursive: true });
        } else {
            mkdirSync(screensDir, { recursive: true });
            cpSync(src, path.join(screensDir, ent.name), { recursive: true });
        }
    }
}

/** Walk a directory into [{ name (posix, relative to base), data }]. */
function walkFiles(dir, baseForName) {
    const out = [];
    const rec = (d) => {
        for (const ent of readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, ent.name);
            if (ent.isDirectory()) rec(full);
            else out.push({
                name: path.relative(baseForName, full).split(path.sep).join("/"),
                data: readFileSync(full),
            });
        }
    };
    rec(dir);
    return out;
}

const posix = (p) => p.split(path.sep).join("/");

function copyFile(from, to) {
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to);
}

/** Point every copied root-absolute asset reference at its zip-local copy under <root>/assets/. */
function rewriteCopiedAssetRefs(root, assetFiles) {
    if (!assetFiles.length) return;
    const foundRels = new Set(assetFiles.map((a) => a.rel));
    for (const fileAbs of walkFiles(root, root).map((f) => path.join(root, f.name))) {
        if (!/\.(ts|tsx|js|jsx|css)$/.test(fileAbs)) continue;
        const src = readFileSync(fileAbs, "utf8");
        const rewritten = rewriteAssetRefs(src, (clean) => {
            if (!foundRels.has(clean)) return null;
            const target = path.join(root, "assets", clean.split("/").join(path.sep));
            let rel = posix(path.relative(path.dirname(fileAbs), target));
            if (!rel.startsWith(".")) rel = "./" + rel;
            return rel;
        });
        if (rewritten !== src) writeFileSync(fileAbs, rewritten);
    }
}

/** Live-render files and the reference images the registry has for them. */
function matchLiveRender(files, assetsDir, label, version) {
    const assetRegistry = assetsDir ? loadAssetRegistry(assetsDir) : [];
    const matchedById = new Map();
    const unresolvedLiveRender = [];
    for (const file of files) {
        if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
        const src = readFileSync(file, "utf8");
        const specs = liveRenderSpecsUsed(src);
        if (!specs.length) continue;
        const matches = matchRegistryEntries(assetRegistry, specs, src, { version });
        if (!matches.length) {
            unresolvedLiveRender.push({ file: label(file), specs });
            continue;
        }
        for (const m of matches) {
            if (!matchedById.has(m.id)) matchedById.set(m.id, { entry: m, files: [] });
            matchedById.get(m.id).files.push(label(file));
        }
    }
    return { matchedById, unresolvedLiveRender };
}

function copyReferenceImages(root, assetsDir, matchedById) {
    const referenceImages = [];
    for (const { entry: regEntry, files } of matchedById.values()) {
        const src = path.join(assetsDir, regEntry.file);
        if (!existsSync(src)) continue; // registry entry pointing at a missing file
        copyFile(src, path.join(root, regEntry.exportAs.split("/").join(path.sep)));
        referenceImages.push({ id: regEntry.id, description: regEntry.description, exportAs: regEntry.exportAs, files });
    }
    return referenceImages;
}

function writeZip(stage, root, outArg, exportName) {
    const zip = zipStore(walkFiles(root, stage)); // names prefixed with "<exportName>/"
    const outDir = path.resolve(outArg);
    mkdirSync(outDir, { recursive: true });
    const zipPath = path.join(outDir, `${exportName}.zip`);
    writeFileSync(zipPath, zip);
    return zipPath;
}

function dsNotFoundMessage(given, tried) {
    return [
        given
            ? `--design-system "${given}" is not a design-system SOURCE tree (package.json + src/). Tried:`
            : "--design-system <DS_REPO_PATH> is required.",
        ...tried.map((t) => `    ${t}`),
        ...(tried.length > 1 ? ["  (the second is the same path from this linked worktree's main checkout)"] : []),
        "  node_modules/<DS_PACKAGE_NAME> ships dist/ and cannot serve a design export.",
    ].join("\n");
}

// ── the design mode (a design version's folder) ─────────────────────────────

export function runDesignExport(args, { log = console.log, cwd = process.cwd() } = {}) {
    const frontend = path.resolve(cwd, args.frontend);
    const { root: ds, tried } = resolveDsRepoPath(args.designSystem, { cwd });
    if (!ds) throw new Error(dsNotFoundMessage(args.designSystem, tried));
    const dsSrc = path.join(ds, "src");

    const versionDir = path.join(frontend, "src", "pages", "design", args.version);
    if (!existsSync(versionDir)) {
        throw new Error(`version folder not found: ${versionDir}\n  (expected <frontend>/src/pages/design/<version>/)`);
    }

    const registryPath = path.join(frontend, "src", "versions", "registry.tsx");
    const registrySource = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : "";
    const entry = parseVersionEntry(registrySource, args.version, { kind: "design" })
        ?? parseVersionEntry(registrySource, args.version)
        ?? { id: args.version, kind: undefined, wired: undefined, label: undefined, entryRoute: "", routes: [] };

    // 1. Collect the version's own import specs.
    const versionFiles = walkFiles(versionDir, versionDir).map((f) => path.join(versionDir, f.name));
    const dsPkg = JSON.parse(readFileSync(path.join(ds, "package.json"), "utf8"));
    const dsName = args.dsPackage ?? dsPkg.name;
    const importsBySpec = new Map();
    for (const file of versionFiles) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        for (const imp of parseImports(maskSource(readFileSync(file, "utf8")))) {
            if (!importsBySpec.has(imp.spec)) importsBySpec.set(imp.spec, new Set());
            imp.names.forEach((n) => importsBySpec.get(imp.spec).add(n));
        }
    }

    // 2. Map names -> source files via the barrels, then follow transitively.
    const dsRes = resolveDsImports(importsBySpec, dsName, dsSrc);
    const dsSources = collectTransitive(dsRes.entryFiles, dsSrc);

    // 2b. Root-absolute static assets (src="/…", url(/…)) the import walk cannot see, resolved
    // against the frontend's public/ — where such URLs are served from at runtime.
    const { found: assetFiles, missing: missingAssets } = collectPublicAssets(
        [...versionFiles, ...dsSources],
        path.join(frontend, "public"),
    );

    const relLabel = (file) => (
        isInside(file, dsSrc)
            ? `design-system/${posix(path.relative(dsSrc, file))}`
            : posix(path.relative(versionDir, file))
    );

    // 2c. Flows: every navigation call in the version's own source, against its routes.
    const flows = [];
    for (const file of versionFiles) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        for (const navPath of parseNavTargets(readFileSync(file, "utf8"))) {
            const route = matchRoute(navPath, entry.routes);
            flows.push({ from: relLabel(file), navPath, to: route?.component ?? null, routePath: route?.path ?? null });
        }
    }

    // 2d. Live-render files, and which of them the reference-image registry (--assets) covers.
    // Deliberately NOT derived from this script's location: that folder is the product's data.
    const assetsDir = args.assets ? path.resolve(cwd, args.assets) : null;
    const { matchedById, unresolvedLiveRender } = matchLiveRender([...versionFiles, ...dsSources], assetsDir, relLabel, args.version);

    // 3. Assemble the export tree in a temp dir, then zip and clean up.
    const stage = mkdtempSync(path.join(tmpdir(), "dce-export-"));
    try {
        const exportName = `${args.version}-export`;
        const root = path.join(stage, exportName);
        mkdirSync(root, { recursive: true });
        copyVersionTree(versionDir, root);
        for (const file of dsSources) copyFile(file, path.join(root, "design-system", path.relative(dsSrc, file)));

        const indexCss = existsSync(path.join(dsSrc, "index.css")) ? readFileSync(path.join(dsSrc, "index.css"), "utf8") : "";
        const tokens = extractTokens(indexCss);
        mkdirSync(path.join(root, "tokens"), { recursive: true });
        writeFileSync(
            path.join(root, "tokens", "tokens.css"),
            `/* Design-system token map, extracted from ${dsName}'s index.css (raw custom properties). */\n:root {\n${tokens.join("\n")}\n}\n`,
        );
        for (const { rel, file } of assetFiles) copyFile(file, path.join(root, "assets", rel.split("/").join(path.sep)));
        rewriteCopiedAssetRefs(root, assetFiles);
        const referenceImages = copyReferenceImages(root, assetsDir, matchedById);

        writeFileSync(
            path.join(root, "README.md"),
            buildReadme(entry, {
                shipped: dsRes.shipped, staging: dsRes.staging, stagingVersion: dsRes.stagingVersion,
                assets: assetFiles.map((a) => a.rel), flows, referenceImages, unresolvedLiveRender,
                assetsDirLabel: args.assets ?? null,
            }),
        );
        const zipPath = writeZip(stage, root, path.resolve(cwd, args.out), exportName);

        log(`  exported ${args.version}`);
        log(`    screens:        ${entry.routes.length} route(s)`);
        log(`    shipped DS used: ${dsRes.shipped.length ? dsRes.shipped.join(", ") : "(none)"}`);
        log(`    staging DS used: ${dsRes.staging.length ? dsRes.staging.join(", ") : "(none)"}${dsRes.stagingVersion ? ` [${dsRes.stagingVersion}]` : ""}`);
        if (dsRes.unresolved.length) log(`    ⚠ DS names no barrel exports: ${dsRes.unresolved.join(", ")}`);
        log(`    DS source files: ${dsSources.length}`);
        log(`    tokens:         ${tokens.length}`);
        log(`    assets:         ${assetFiles.length ? assetFiles.map((a) => a.rel).join(", ") : "(none)"}`);
        if (missingAssets.length) log(`    ⚠ referenced but NOT found in public/: ${missingAssets.join(", ")}`);
        log(`    flows resolved: ${flows.filter((f) => f.to).length}/${flows.length}`);
        log(`    reference images: ${referenceImages.length ? referenceImages.map((r) => r.exportAs).join(", ") : "(none)"}`);
        if (unresolvedLiveRender.length) {
            log(`    ⚠ live-render, no reference image yet: ${unresolvedLiveRender.map((f) => f.file).join(", ")}`);
            log(`      -> ask the designer whether to supply one (${args.assets ?? "<no --assets given>"}/README.md)`);
        }
        log(`    -> ${zipPath}`);
        return { zipPath, entry, flows, ds: dsRes, dsSources, referenceImages, unresolvedLiveRender };
    } finally {
        rmSync(stage, { recursive: true, force: true });
    }
}

// ── the production mode (the registry's production entry) ───────────────────

/** Every registry id of a given kind — what an error names when the asked-for one is absent. */
function idsOfKind(registrySource, kind) {
    return parseVersionEntries(registrySource).filter((e) => e.kind === kind).map((e) => e.id);
}

export function runProductionExport(args, { log = console.log, cwd = process.cwd() } = {}) {
    const frontend = path.resolve(cwd, args.frontend);
    const src = path.join(frontend, "src");
    const registryPath = path.join(src, "versions", "registry.tsx");
    if (!existsSync(registryPath)) throw new Error(`no version registry at ${registryPath}`);
    const registrySource = readFileSync(registryPath, "utf8");

    // 1. The production entry — never a design entry of the same id.
    const entry = parseVersionEntry(registrySource, args.version, { kind: "prod" });
    if (!entry) {
        const prodIds = idsOfKind(registrySource, "prod");
        throw new Error(
            `${args.version} has no production entry in ${posix(path.relative(cwd, registryPath))}` +
            ` (production ids: ${prodIds.length ? prodIds.join(", ") : "none"}).` +
            " --mode production exports what ships; a design version is exported with --mode design.",
        );
    }
    if (!entry.routes.length) throw new Error(`${args.version}'s production entry declares no routes this exporter can read`);

    // 2. The file behind each route: a lazyPage() import path, or the registry's own import of a
    // directly referenced component.
    const bindings = new Map(parseImportBindings(registrySource).map((b) => [b.local, b]));
    const routeFiles = entry.routes.map((r) => {
        const spec = r.source ?? bindings.get(r.component)?.spec ?? null;
        return { ...r, file: spec ? resolveLocal(registryPath, spec, [src]) : null, spec };
    });
    const unlocated = routeFiles.filter((r) => !r.file);
    if (unlocated.length) {
        throw new Error(`could not locate the source of route component(s): ${unlocated.map((r) => `${r.component} (${r.spec ?? "no import found in registry.tsx"})`).join(", ")}`);
    }

    // 3. Host-declared shell screens (PROD_SHELL_ENTRIES), relative to the frontend package.
    const shell = args.shell.map((s) => {
        const file = path.resolve(frontend, s.file);
        if (!existsSync(file) || !isInside(file, src)) {
            throw new Error(`--shell ${s.path}: ${s.file} is not a file under ${posix(path.relative(cwd, src)) || "src"}/`);
        }
        return { ...s, file };
    });

    // 4. The app's stylesheet: the CSS its entry module imports. A screen without it reads unstyled,
    // and no route imports it — the entry does.
    const styleEntries = [];
    for (const name of ["main.tsx", "main.ts", "main.jsx", "main.js"]) {
        const main = path.join(src, name);
        if (!existsSync(main)) continue;
        for (const spec of importSpecs(readFileSync(main, "utf8"))) {
            if (!spec.endsWith(".css")) continue;
            const hit = resolveLocal(main, spec, [src]);
            if (hit) styleEntries.push(hit);
        }
        break;
    }

    // 5. The whole graph, and each screen's own slice (for its reachable-calls column).
    const graph = walkImportGraph([...routeFiles.map((r) => r.file), ...shell.map((s) => s.file), ...styleEntries], src);
    const callsCache = new Map();
    const callsOf = (file) => {
        if (!callsCache.has(file)) {
            const calls = new Set();
            for (const f of walkImportGraph([file], src).files) {
                if (/\.[cm]?[jt]sx?$/.test(f)) apiCallsIn(readFileSync(f, "utf8")).forEach((c) => calls.add(c));
            }
            callsCache.set(file, [...calls].sort());
        }
        return callsCache.get(file);
    };
    const srcLabel = (f) => `src/${posix(path.relative(src, f))}`;

    // 6. The design system: its source tree when one is available, else the installed package —
    // names and tokens only, stated as such.
    const { root: dsRoot, tried } = resolveDsRepoPath(args.designSystem, { cwd });
    const dsSrc = dsRoot ? path.join(dsRoot, "src") : null;
    const dsPkgName = dsRoot ? JSON.parse(readFileSync(path.join(dsRoot, "package.json"), "utf8")).name : null;
    const dsName = args.dsPackage ?? dsPkgName;
    if (!dsName) throw new Error("--ds-package <DS_PACKAGE_NAME> is required when no design-system source tree is available");
    let installed = null;
    if (!dsRoot) {
        installed = findInstalledPackage(frontend, dsName);
        if (!installed) {
            throw new Error(`${dsNotFoundMessage(args.designSystem, tried)}\n  and ${dsName} is not installed under ${frontend} either — nothing can name its components or supply its tokens.`);
        }
    }
    const dsRes = resolveDsImports(graph.external, dsName, dsSrc);
    const dsSources = dsSrc ? collectTransitive(dsRes.entryFiles, dsSrc) : [];
    const label = (f) => (dsSrc && isInside(f, dsSrc) ? `design-system/${posix(path.relative(dsSrc, f))}` : srcLabel(f));

    // 7. Assets, live-render files, flows.
    const { found: assetFiles, missing: missingAssets } = collectPublicAssets([...graph.files, ...dsSources], path.join(frontend, "public"));
    const assetsDir = args.assets ? path.resolve(cwd, args.assets) : null;
    const { matchedById, unresolvedLiveRender } = matchLiveRender([...graph.files, ...dsSources], assetsDir, label, args.version);
    const allRoutes = [...entry.routes, ...shell.map((s) => ({ path: s.path.replace(/^\//, ""), component: s.component ?? posix(path.relative(src, s.file)) }))];
    const flows = [];
    for (const f of graph.files) {
        if (!/\.[cm]?[jt]sx?$/.test(f)) continue;
        for (const navPath of new Set(parseNavTargets(readFileSync(f, "utf8")))) {
            const route = matchRoute(navPath, allRoutes);
            flows.push({ from: srcLabel(f), navPath, to: route?.component ?? null, routePath: route?.path ?? null });
        }
    }

    // 8. Fixtures — the answer to "what is the mock data" for a wired version, never implicit.
    const fixturesDir = args.fixtures ? path.resolve(cwd, args.fixtures) : null;
    const fixtures = fixturesDir ? loadFixtures(fixturesDir) : null;
    const fixturesState = !fixturesDir ? "unbound" : fixtures ? "included" : "empty";

    // 9. Assemble.
    const stage = mkdtempSync(path.join(tmpdir(), "dce-prod-export-"));
    try {
        const exportName = `${args.version}-production-export`;
        const root = path.join(stage, exportName);
        mkdirSync(root, { recursive: true });
        for (const f of graph.files) copyFile(f, path.join(root, "src", path.relative(src, f)));

        let tokenCss = "";
        if (dsSrc) {
            for (const f of dsSources) copyFile(f, path.join(root, "design-system", path.relative(dsSrc, f)));
            const barrels = ["index.ts", "index.css", path.join("staging", "index.ts")];
            if (dsRes.stagingVersion) barrels.push(path.join("staging", dsRes.stagingVersion, "index.ts"));
            for (const b of barrels) {
                if (existsSync(path.join(dsSrc, b))) copyFile(path.join(dsSrc, b), path.join(root, "design-system", b));
            }
            if (existsSync(path.join(dsSrc, "index.css"))) tokenCss += readFileSync(path.join(dsSrc, "index.css"), "utf8");
            const tokensDir = path.join(dsSrc, "tokens");
            if (existsSync(tokensDir)) {
                for (const f of walkFiles(tokensDir, tokensDir)) {
                    if (!f.name.endsWith(".css")) continue;
                    tokenCss += `\n${f.data}`;
                    copyFile(path.join(tokensDir, f.name), path.join(root, "tokens", "design-system", f.name));
                }
            }
        } else {
            const css = installedStylesheet(installed);
            if (css) tokenCss = readFileSync(css, "utf8");
        }
        const tokens = extractTokens(tokenCss);
        mkdirSync(path.join(root, "tokens"), { recursive: true });
        writeFileSync(
            path.join(root, "tokens", "tokens.css"),
            `/* ${dsName} custom properties, extracted from its ${dsSrc ? "source" : "installed package's built stylesheet"}. */\n:root {\n${tokens.join("\n")}\n}\n`,
        );

        const mockTable = {};
        if (fixtures) {
            for (const e of fixtures.entries) {
                copyFile(e.abs, path.join(root, "data", "api", e.file));
                mockTable[`GET ${fixtures.index.apiPrefix ?? ""}${e.resource}`] = { status: e.status, file: `api/${e.file}` };
            }
            writeFileSync(path.join(root, "data", "index.json"), JSON.stringify(fixtures.index, null, 2) + "\n");
            writeFileSync(path.join(root, "data", "mock-api.json"), JSON.stringify(mockTable, null, 2) + "\n");
        }

        for (const { rel, file } of assetFiles) copyFile(file, path.join(root, "assets", rel.split("/").join(path.sep)));
        rewriteCopiedAssetRefs(root, assetFiles);
        const referenceImages = copyReferenceImages(root, assetsDir, matchedById);

        const outside = graph.outside.map((o) => ({ from: srcLabel(o.from), spec: o.spec }));
        writeFileSync(
            path.join(root, "README.md"),
            buildProductionReadme({
                entry,
                frontendLabel: `\`${posix(path.relative(cwd, frontend)) || "."}\``,
                fileCount: graph.files.length,
                routeRows: routeFiles.map((r) => ({ path: r.path, component: r.component, guard: r.guard, file: srcLabel(r.file), calls: callsOf(r.file) })),
                shellRows: shell.map((s) => ({ path: s.path, component: s.component, file: srcLabel(s.file), calls: callsOf(s.file) })),
                flows: flows.sort((a, b) => `${a.from}${a.navPath}`.localeCompare(`${b.from}${b.navPath}`)),
                ds: { mode: dsSrc ? "source" : "installed", dsName, ...dsRes },
                assets: assetFiles.map((a) => a.rel),
                referenceImages, unresolvedLiveRender,
                assetsDirLabel: args.assets ?? null,
                mockData: mockDataSection(entry, { fixtures, state: fixturesState, fixturesLabel: args.fixtures }),
                outside,
            }),
        );
        const zipPath = writeZip(stage, root, path.resolve(cwd, args.out), exportName);

        log(`  exported ${args.version} (production entry, wired: ${entry.wired})`);
        log(`    routes:          ${entry.routes.map((r) => `/${r.path}`).join(", ")}${shell.length ? ` + shell ${shell.map((s) => s.path).join(", ")}` : ""}`);
        log(`    source files:    ${graph.files.length} (tests excluded)`);
        if (outside.length) log(`    ⚠ relative imports not followed: ${outside.map((o) => `${o.from} → ${o.spec}`).join(", ")}`);
        log(`    design system:   ${dsSrc ? `source tree ${dsRoot}` : `⚠ NO source tree — names and tokens only, from the installed ${installed}`}`);
        if (!dsSrc && args.designSystem) log(`      tried: ${tried.join(", ")}`);
        log(`    shipped DS used: ${dsRes.shipped.join(", ") || "(none)"}`);
        log(`    staging DS used: ${dsRes.staging.join(", ") || "(none)"}${dsRes.stagingVersion ? ` [${dsRes.stagingVersion}]` : ""}`);
        if (dsRes.unresolved.length) log(`    ⚠ DS names no barrel exports: ${dsRes.unresolved.join(", ")}`);
        log(`    DS source files: ${dsSources.length}`);
        log(`    tokens:          ${tokens.length}`);
        log(`    mock data:       ${fixturesState === "included"
            ? `${fixtures.entries.length} recorded answer(s)${fixtures.index.curated?.notes?.length ? `, ${fixtures.index.curated.notes.length} curation note(s)` : ""}`
            : fixturesState === "empty" ? `⚠ none — ${args.fixtures} holds no index.json for ${args.version}; record with FIXTURE_CAPTURE_CMD`
            : "none — no fixtures source bound (FIXTURES_DIR null); the README says so"}`);
        if (fixtures?.missing.length) log(`    ⚠ fixtures listed but missing: ${fixtures.missing.join(", ")}`);
        log(`    assets:          ${assetFiles.map((a) => a.rel).join(", ") || "(none)"}`);
        if (missingAssets.length) log(`    ⚠ referenced but NOT found in public/: ${missingAssets.join(", ")}`);
        log(`    flows resolved:  ${flows.filter((f) => f.to).length}/${flows.length}`);
        log(`    reference images: ${referenceImages.map((r) => r.exportAs).join(", ") || "(none)"}`);
        if (unresolvedLiveRender.length) {
            log(`    ⚠ live-render, no reference image yet: ${unresolvedLiveRender.map((f) => f.file).join(", ")}`);
            log(`      -> ask the designer whether to supply one (${args.assets ?? "<no --assets given>"}/README.md)`);
        }
        log(`    -> ${zipPath}`);
        return { zipPath, entry, graph, flows, ds: { mode: dsSrc ? "source" : "installed", ...dsRes }, dsSources, fixturesState, referenceImages, unresolvedLiveRender };
    } finally {
        rmSync(stage, { recursive: true, force: true });
    }
}

// ── main ────────────────────────────────────────────────────────────────────

export function runExport(args, opts) {
    return args.mode === "production" ? runProductionExport(args, opts) : runDesignExport(args, opts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        runExport(parseArgs(process.argv.slice(2)));
    } catch (err) {
        console.error(`  ${err.message}`);
        process.exit(1);
    }
}
