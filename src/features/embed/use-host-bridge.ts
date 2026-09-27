"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "../assistant/domain/models";
import {
  type Activity,
  type AssistantMessage,
  envelope,
  type PanelAction,
  parseHostMessage,
  type ReadyStatus,
  type Theme,
} from "./protocol";

export type HostState = {
  /** A validated host from the allowlist has initialized the protocol. */
  connected: boolean;
  theme: Theme;
  visible: boolean;
  expanded: boolean;
  canExpand: boolean;
  page: Page | null;
  /** Increments on each `host.focus` received while visible. */
  focusSignal: number;
};

/**
 * Assistant side of the embed protocol. Messages are accepted only when `event.source` is the
 * parent window and `event.origin` is in the allowlist; the first origin that initializes is
 * pinned and every later message must come from it. Outgoing messages always target an exact
 * origin: before initialization `assistant.ready` is posted once per allowlisted origin (the
 * browser drops those whose origin does not match the parent), afterwards only to the pinned one.
 */
export function useHostBridge(
  allowedOrigins: readonly string[],
  initial: { theme: Theme; page: Page | null },
) {
  const [state, setState] = useState<HostState>({
    connected: false,
    theme: initial.theme,
    visible: true,
    expanded: false,
    canExpand: false,
    page: initial.page,
    focusSignal: 0,
  });
  const origin = useRef<string | null>(null);
  const visibleRef = useRef(true);
  const status = useRef<ReadyStatus>("starting");

  const post = useCallback((message: AssistantMessage) => {
    if (origin.current) window.parent.postMessage(envelope(message), origin.current);
  }, []);

  useEffect(() => {
    if (window.parent === window || allowedOrigins.length === 0) return;
    function receive(event: MessageEvent<unknown>) {
      if (event.source !== window.parent || !allowedOrigins.includes(event.origin)) return;
      if (origin.current && event.origin !== origin.current) return;
      const message = parseHostMessage(event.data);
      if (!message) return;
      if (message.type === "host.init") {
        origin.current = event.origin;
        visibleRef.current = message.visible;
        setState((current) => ({
          ...current,
          connected: true,
          theme: message.theme,
          visible: message.visible,
          expanded: message.expanded,
          canExpand: message.canExpand,
          page: message.page,
        }));
        window.parent.postMessage(
          envelope({ type: "assistant.ready", status: status.current }),
          event.origin,
        );
        return;
      }
      if (!origin.current) return; // Everything else requires a completed initialization.
      switch (message.type) {
        case "host.state":
          visibleRef.current = message.visible;
          setState((current) => ({
            ...current,
            visible: message.visible,
            expanded: message.expanded,
          }));
          return;
        case "host.preferences":
          setState((current) => ({ ...current, theme: message.theme }));
          return;
        case "host.context":
          setState((current) => ({ ...current, page: message.page }));
          return;
        case "host.focus":
          if (!visibleRef.current) return;
          // Focus the frame's window first; WebKit may still refuse to move focus inside a
          // cross-origin frame without a user gesture there (docs/embed-integration.md).
          window.focus();
          setState((current) => ({ ...current, focusSignal: current.focusSignal + 1 }));
          return;
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      // Escape anywhere in the assistant asks the host to minimize, unless a control handled it.
      if (event.key === "Escape" && !event.defaultPrevented && origin.current)
        window.parent.postMessage(
          envelope({ type: "assistant.request", action: "minimize" }),
          origin.current,
        );
    }
    window.addEventListener("message", receive);
    window.addEventListener("keydown", onKeyDown);
    for (const target of allowedOrigins)
      window.parent.postMessage(
        envelope({ type: "assistant.ready", status: status.current }),
        target,
      );
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("keydown", onKeyDown);
      origin.current = null;
    };
  }, [allowedOrigins]);

  const reportStatus = useCallback(
    (next: ReadyStatus) => {
      if (status.current === next) return;
      status.current = next;
      post({ type: "assistant.ready", status: next });
    },
    [post],
  );

  const lastActivity = useRef<Activity>("idle");
  const reportActivity = useCallback(
    (next: Activity) => {
      if (lastActivity.current === next) return;
      lastActivity.current = next;
      post({ type: "assistant.activity", state: next });
    },
    [post],
  );

  const request = useCallback(
    (action: PanelAction) => post({ type: "assistant.request", action }),
    [post],
  );

  return { ...state, reportStatus, reportActivity, request };
}
