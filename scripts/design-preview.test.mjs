/**
 * Tests for scripts/design-preview.mjs.
 *
 * Two things are worth holding still here. The first is the capability string: it exists in
 * three places — this stub, the frontend hook and the API's PlatformCapabilities — and a
 * preview that grants the wrong one renders exactly like a preview that grants none, with no
 * error anywhere. The second is the 501: the seam is only honest if a wired version fails
 * loudly instead of quietly rendering an empty screen, so the default branch is a tested
 * behaviour rather than a fallthrough.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  corsHeaders,
  DEFAULT_PORT,
  PREVIEW_CAPABILITY,
  PREVIEW_SUBJECT,
  readPublicUiVersion,
  route,
  webServerArgs,
} from "./design-preview.mjs";

describe("the synthetic session", () => {
  it("grants exactly the capability the version gate asks for", () => {
    const { status, body } = route("GET", "/api/v1/me", "v1.0.0");

    assert.equal(status, 200);
    assert.equal(body.authenticated, true);
    assert.equal(body.subjectId, PREVIEW_SUBJECT);
    assert.deepEqual(body.capabilities, [PREVIEW_CAPABILITY]);
  });

  it("names the capability the frontend and the API both name", () => {
    // Pinned as a literal rather than imported: the other two copies live in TypeScript and
    // C#, so nothing but a stated value can catch a drift between the three.
    assert.equal(PREVIEW_CAPABILITY, "platform.design-versions.preview");
  });

  it("is obviously synthetic in a log", () => {
    assert.equal(PREVIEW_SUBJECT, "design-preview");
  });
});

describe("public-config", () => {
  it("serves the version it was given", () => {
    const { status, body } = route("GET", "/api/v1/public-config", "v2.0.0");

    assert.equal(status, 200);
    assert.deepEqual(body, { publicUiVersion: "v2.0.0" });
  });

  it("serves an empty version rather than inventing one", () => {
    assert.deepEqual(route("GET", "/api/v1/public-config", "").body, { publicUiVersion: "" });
  });
});

describe("everything else", () => {
  for (const pathname of ["/api/v1/widgets", "/api/v1/widgets/42", "/api/v1/anything"]) {
    it(`answers 501 for ${pathname}, with the reason`, () => {
      const { status, body } = route("GET", pathname, "v1.0.0");

      assert.equal(status, 501);
      assert.match(body.detail, /wired/);
      assert.match(body.detail, /pnpm run dev/);
    });
  }

  it("answers a preflight with no body", () => {
    assert.deepEqual(route("OPTIONS", "/api/v1/me", "v1.0.0"), { status: 204, body: null });
  });

  it("refuses a write rather than pretending to accept it", () => {
    const { status, body } = route("POST", "/api/v1/widgets", "v1.0.0");

    assert.equal(status, 405);
    assert.match(body.detail, /POST/);
  });
});

describe("CORS", () => {
  it("allows the one non-simple header apiClient always sends", () => {
    assert.match(corsHeaders()["access-control-allow-headers"], /x-request-id/);
  });
});

describe("readPublicUiVersion", () => {
  const withSettings = (contents) => {
    const dir = mkdtempSync(path.join(tmpdir(), "design-preview-"));
    const file = path.join(dir, "appsettings.Development.json");
    writeFileSync(file, contents);
    try {
      return readPublicUiVersion(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("reads what the dev API would answer", () => {
    assert.equal(withSettings(JSON.stringify({ Public: { UiVersion: "v1.0.0" } })), "v1.0.0");
  });

  it("trims it", () => {
    assert.equal(withSettings(JSON.stringify({ Public: { UiVersion: " v1.0.0 " } })), "v1.0.0");
  });

  it("returns empty when the section is absent", () => {
    assert.equal(withSettings(JSON.stringify({ Jwt: { Secret: "x" } })), "");
  });

  it("returns empty rather than throwing on an unparseable file", () => {
    assert.equal(withSettings("{ not json"), "");
  });

  it("returns empty when the file does not exist", () => {
    assert.equal(readPublicUiVersion(path.join(tmpdir(), "no-such-appsettings.json")), "");
  });
});

describe("the port", () => {
  it("is neither the dev API's nor the E2E suite's", () => {
    // 3000 is the dev API. 3100 is the API tests/e2e/playwright.config.ts starts, and a preview
    // left running on it would be picked up by an E2E run as if it were the real thing.
    assert.notEqual(DEFAULT_PORT, 3000);
    assert.notEqual(DEFAULT_PORT, 3100);
  });
});

describe("how the frontend is started", () => {
  it("leaves vite alone when no port is asked for", () => {
    // A designer's run. vite picks its own port and steps aside if it is taken, which is what a
    // person wants and the reason this is not pinned unconditionally.
    assert.deepEqual(webServerArgs({}), ["--filter", "./apps/web", "run", "dev"]);
  });

  it("pins the port strictly when one is asked for", () => {
    // --strictPort, not a best effort: a caller that named a port is already waiting on that
    // URL, and a vite that quietly moved to the next one is a timeout with no reason in it.
    assert.deepEqual(webServerArgs({ DESIGN_PREVIEW_WEB_PORT: "5373" }), [
      "--filter",
      "./apps/web",
      "exec",
      "vite",
      "--port",
      "5373",
      "--strictPort",
    ]);
  });

  it("passes the port through `exec`, never through `run dev --`", () => {
    // pnpm forwards a `--` to the script, and a flag arriving after one is read as a positional
    // argument and silently ignored — the preview would serve on the wrong port with no error
    // anywhere. This asserts the shape, not just that the number appears somewhere.
    const args = webServerArgs({ DESIGN_PREVIEW_WEB_PORT: "5373" });

    assert.ok(args.includes("exec"), "the port has to reach vite, not the dev script");
    assert.ok(!args.includes("--"), "a `--` here is how the flag gets swallowed");
  });

  it("ignores an empty or blank value", () => {
    // An unset variable arrives as "" through a shell or a CI matrix, and "" is not a port.
    const ordinary = ["--filter", "./apps/web", "run", "dev"];

    assert.deepEqual(webServerArgs({ DESIGN_PREVIEW_WEB_PORT: "" }), ordinary);
    assert.deepEqual(webServerArgs({ DESIGN_PREVIEW_WEB_PORT: "   " }), ordinary);
  });
});
