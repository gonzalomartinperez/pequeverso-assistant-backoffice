"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { Assistant } from "../application/assistant";

/** Subscribes to the controller and owns its lifetime (StrictMode-safe start/dispose pair). */
export function useConversation(assistant: Assistant) {
  const state = useSyncExternalStore(
    assistant.subscribe,
    assistant.getSnapshot,
    assistant.getSnapshot,
  );
  useEffect(() => {
    assistant.start();
    return assistant.dispose;
  }, [assistant]);
  return state;
}
