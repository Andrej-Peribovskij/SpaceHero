/**
 * Tests for scripts/public-version.mjs.
 *
 * Three things are worth holding still. The patterns, because they are surgical by design and a
 * pattern that quietly matches nothing is exactly how the two declarations drift apart. The
 * refusals, because this script writes to committed files and the cheapest moment to stop a typo
 * is before it reaches them. And the committed values themselves: the last describe block reads
 * the real repository, so a hand-edit to one file and not the other fails the gate rather than
 * showing up as `pnpm run dev` and `pnpm run stack:up` serving different applications.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collect,
  DECLARATIONS,
  isTechRevision,
  isVersionShaped,
  problems,
  readDeclared,
  registryMentions,
  replaceDeclared,
} from "./public-version.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const [SETTINGS, COMPOSE] = DECLARATIONS;

/** A settings file shaped like the real one, including a sibling section that also has a value. */
const SETTINGS_TEXT = `{
  "Jwt": {
    "Secret": "dev-only"
  },
  "Public": {
    "UiVersion": "v1.0.0"
  },
  "Cors": {
    "AllowedOrigins": ["http://localhost:5173"]
  }
}
`;

/** A compose fragment with the comment block the real file carries above the line. */
const COMPOSE_TEXT = `    environment:
      ASPNETCORE_ENVIRONMENT: Production
      # Which version real users see. Runtime, never build-time.
      PUBLIC_UI_VERSION: \${PUBLIC_UI_VERSION:-v1.0.0}
    ports:
      - "3000:8080"
`;

describe("reading a declaration", () => {
  it("finds the settings value", () => {
    assert.equal(readDeclared(SETTINGS_TEXT, SETTINGS.pattern), "v1.0.0");
  });

  it("finds the compose default inside the shell expansion", () => {
    assert.equal(readDeclared(COMPOSE_TEXT, COMPOSE.pattern), "v1.0.0");
  });

  it("does not wander into a neighbouring section", () => {
    // The settings pattern excludes braces between "Public" and "UiVersion" on purpose: without
    // that, a "Public" section with no UiVersion would match a UiVersion further down the file
    // and the script would rewrite something it was never pointed at.
    const misleading = `{
  "Public": {
    "Something": "else"
  },
  "Other": {
    "UiVersion": "v9.9.9"
  }
}
`;

    assert.equal(readDeclared(misleading, SETTINGS.pattern), null);
  });

  it("returns null rather than guessing when the shape is gone", () => {
    assert.equal(readDeclared('{ "Public": {} }', SETTINGS.pattern), null);
    assert.equal(readDeclared("      PUBLIC_UI_VERSION: v1.0.0\n", COMPOSE.pattern), null);
  });
});

describe("replacing a declaration", () => {
  it("changes the value and nothing else", () => {
    const next = replaceDeclared(SETTINGS_TEXT, SETTINGS.pattern, "v2.0.0");

    assert.equal(readDeclared(next, SETTINGS.pattern), "v2.0.0");
    assert.equal(next, SETTINGS_TEXT.replace('"UiVersion": "v1.0.0"', '"UiVersion": "v2.0.0"'));
  });

  it("keeps the comments around the compose line", () => {
    const next = replaceDeclared(COMPOSE_TEXT, COMPOSE.pattern, "v2.0.0");

    assert.ok(next.includes("# Which version real users see. Runtime, never build-time."));
    assert.ok(next.includes("PUBLIC_UI_VERSION: ${PUBLIC_UI_VERSION:-v2.0.0}"));
    assert.ok(next.includes('- "3000:8080"'));
  });

  it("refuses to write a file it did not match", () => {
    // Not a warning. A `set` that reports success having changed nothing is the failure this
    // whole script exists to remove.
    assert.throws(() => replaceDeclared('{ "Public": {} }', SETTINGS.pattern, "v2.0.0"), /found 0/);
  });

  it("refuses when there is more than one candidate", () => {
    const twice = SETTINGS_TEXT + SETTINGS_TEXT;

    assert.throws(() => replaceDeclared(twice, SETTINGS.pattern, "v2.0.0"), /found 2/);
  });
});

describe("what may be set", () => {
  it("accepts the shapes the registry accepts", () => {
    for (const id of ["v1", "v2.0.0", "v10.4", "v2.1.0-tech", "v3.0.0-rc.1"]) {
      assert.ok(isVersionShaped(id), id);
    }
  });

  it("rejects anything else", () => {
    for (const id of ["latest", "2.0.0", "vNext", "", "v", "design/v2.0.0"]) {
      assert.ok(!isVersionShaped(id), id);
    }
  });

  it("recognises a -tech revision", () => {
    // Prompt 03 registers these as kind: "design", and rule 1 of prompt 06 is that a design
    // version is never public. The suffix is not proof of the kind — the registry is — but it is
    // the one case cheap enough to refuse before anything is written.
    assert.ok(isTechRevision("v2.1.0-tech"));
    assert.ok(isTechRevision("v2.1.0-tech.2"));
    assert.ok(!isTechRevision("v2.1.0"));
    assert.ok(!isTechRevision("v2.1.0-technical-preview"));
  });
});

describe("the registry sanity check", () => {
  const registry = `export const PROD_VERSIONS = [
  { id: "v1.0.0", kind: "prod", wired: true },
];
`;

  it("finds a registered id", () => {
    assert.ok(registryMentions(registry, "v1.0.0"));
  });

  it("does not find one that is absent", () => {
    assert.ok(!registryMentions(registry, "v2.0.0"));
  });

  it("does not let the dots match anything", () => {
    // "v1x0x0" would pass an unescaped pattern, which is the kind of near-miss a typo produces.
    assert.ok(!registryMentions(registry, "v1x0x0"));
  });
});

describe("reporting problems", () => {
  const entry = (file, value) => ({ file, names: file, serves: file, value });

  it("says nothing when the declarations agree", () => {
    assert.deepEqual(problems([entry("a", "v1.0.0"), entry("b", "v1.0.0")]), []);
  });

  it("names both files when they disagree", () => {
    const found = problems([entry("a", "v1.0.0"), entry("b", "v2.0.0")]);

    assert.ok(found.length > 0);
    assert.match(found[0], /a says "v1\.0\.0"/);
    assert.match(found[0], /b says "v2\.0\.0"/);
  });

  it("reports a declaration it could not find at all", () => {
    const found = problems([entry("a", "v1.0.0"), entry("b", null)]);

    assert.equal(found.length, 1);
    assert.match(found[0], /^b has no/);
  });

  it("reports a value that is not a version", () => {
    assert.match(problems([entry("a", "latest"), entry("b", "latest")])[0], /not shaped like/);
  });
});

describe("this repository, as committed", () => {
  const read = (relative) => readFileSync(join(repoRoot, relative), "utf8");

  it("declares the public version in every place this script knows about", () => {
    for (const entry of collect(read)) {
      assert.notEqual(entry.value, null, `${entry.file} — ${entry.names} not found`);
    }
  });

  it("agrees with itself", () => {
    // The invariant the script exists to keep. A hand-edit to one file and not the other fails
    // here rather than in a browser weeks later.
    assert.deepEqual(problems(collect(read)), []);
  });

  it("names a version that is actually in the registry", () => {
    const [{ value }] = collect(read);

    assert.ok(
      registryMentions(read("apps/web/src/versions/registry.tsx"), value),
      `"${value}" is declared public but has no entry in the version registry`,
    );
  });
});
