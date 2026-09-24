/**
 * Where the API is, read at runtime rather than baked in at build time.
 *
 * The same built bundle is deployed to every environment; `config.json` is
 * served by the dev server (see `vite.config.ts`) and written into the image at
 * container startup. Reading it here rather than through `import.meta.env` is
 * what makes one artifact promotable.
 */
export interface RuntimeConfig {
  apiUrl: string;
}

let configPromise: Promise<RuntimeConfig> | null = null;

export function getRuntimeConfig(): Promise<RuntimeConfig> {
  // Fetched once per page load and shared. Each call site asking for its own
  // copy would be one request per API call.
  configPromise ??= fetch("/config.json").then((response) => response.json() as Promise<RuntimeConfig>);

  return configPromise;
}

/** Test seam: drops the memoized config so a test can serve a different one. */
export function resetRuntimeConfig(): void {
  configPromise = null;
}
