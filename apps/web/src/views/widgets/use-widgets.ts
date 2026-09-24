import { useQuery } from "@tanstack/react-query";

import type { components } from "@my-app/schemas/api-v1";
import { apiJson } from "../../infra/http/client";

/**
 * The contract type, not a hand-written copy: `WidgetResponse` is generated from
 * the committed OpenAPI snapshot, so a change to the API's response shape breaks
 * this at compile time rather than in the browser.
 */
export type Widget = components["schemas"]["WidgetResponse"];

export function useWidgets() {
  return useQuery({
    queryKey: ["widgets"],
    queryFn: () => apiJson<Widget[]>("/widgets"),
  });
}
