"use client";
import { useState } from "react";
import { createHttpTransport } from "./adapters/http";
import { type Assistant, createAssistant } from "./application/assistant";
import type { LinkPolicy } from "./domain/links";

/**
 * Composition root: the only place that wires the controller to its HTTP adapter. The API is
 * same-origin (`/api/v1`, routed by the proxy), so no API URL is configured in the browser.
 */
export function useAssistantInstance(policy: LinkPolicy): Assistant {
  const [assistant] = useState(() =>
    createAssistant(
      createHttpTransport(),
      { id: () => crypto.randomUUID(), now: () => new Date().toISOString() },
      { policy },
    ),
  );
  return assistant;
}
