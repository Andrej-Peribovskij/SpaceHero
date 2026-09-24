import { v7 as uuidv7 } from "uuid";

import { getRuntimeConfig } from "../config/runtime-config";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /**
     * The `x-request-id` this call was sent with.
     *
     * Carried on the error rather than looked up later because this is the one
     * moment both halves exist together: the id is generated here, the server
     * logged the same one, and a report made from this error is what joins
     * them.
     */
    public readonly requestId?: string,
    /** The app-owned error code from the Problem Details body, when there is one. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const API_PREFIX = "/api/v1";

/**
 * Calls the API.
 *
 * Views pass canonical resource paths — `/widgets/42` reaches
 * `/api/v1/widgets/42`. Routes describe resources, not personas: what the caller
 * may do is decided by the capabilities in their token, which the server reads
 * (ADR-0003). Attach the bearer token here, once, when this scaffold grows a
 * session.
 */
export async function apiClient(path: string, options: RequestInit = {}): Promise<Response> {
  const config = await getRuntimeConfig();

  // Generated once and kept, so the id that goes out on the wire is the id an
  // error can be reported under.
  const requestId = uuidv7();

  const headers = new Headers(options.headers);
  headers.set("x-request-id", requestId);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${config.apiUrl}${API_PREFIX}${path}`, { ...options, headers });

  if (!response.ok) {
    // RFC 7807 on the failure paths this API controls; anything else (a proxy,
    // a crash) may not be JSON at all, so parsing is allowed to fail.
    const problem = await response.json().catch(() => null);

    throw new HttpError(
      response.status,
      problem?.detail ?? problem?.title ?? response.statusText,
      response.headers.get("x-request-id") ?? requestId,
      problem?.code,
    );
  }

  return response;
}

/** As `apiClient`, but parses the JSON body into the contract type. */
export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiClient(path, options);
  return (await response.json()) as T;
}
