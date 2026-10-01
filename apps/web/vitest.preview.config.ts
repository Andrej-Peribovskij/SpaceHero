import { defineConfig } from "vitest/config";

/**
 * Runs the `.preview.ts` files, and only them: tools that render things for a person to look at,
 * such as `src/views/intro/tools/render-card.preview.ts`. The normal test run never collects them.
 * Plain Node, no DOM: they draw into buffers and write files.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.preview.ts"],
  },
});
