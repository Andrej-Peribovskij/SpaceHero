import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Serves `/config.json` in dev, the same file the container writes at startup.
 * The app reads where its API is at runtime, so one built bundle is promotable
 * across environments.
 */
function runtimeConfigPlugin(env: Record<string, string>): Plugin {
  return {
    name: "runtime-config",
    configureServer(server) {
      server.middlewares.use("/config.json", (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ apiUrl: env.API_URL ?? "http://localhost:3000" }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss(), runtimeConfigPlugin(env)],
    build: {
      sourcemap: "hidden",
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      globals: true,
    },
  };
});
