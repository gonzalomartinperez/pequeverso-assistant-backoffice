"use client";
import { ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { copy } from "@/shared/i18n/copy";
import { BrandMark } from "@/shared/ui/brand-mark";
import { IconButton } from "@/shared/ui/icon-button";
import type { LinkPolicy } from "../assistant/domain/links";
import type { Page } from "../assistant/domain/models";
import { useAssistantInstance } from "../assistant/entry";
import { ClearControl } from "../assistant/presentation/clear-control";
import { PresentationProvider } from "../assistant/presentation/context";
import { ConversationView } from "../assistant/presentation/conversation-view";
import { useConversation } from "../assistant/presentation/use-conversation";
import type { Theme } from "./protocol";
import { useHostBridge } from "./use-host-bridge";

type Props = {
  policy: LinkPolicy;
  supportUrl: string;
  allowedOrigins: string[];
  initialTheme: Theme;
  initialPage: Page | null;
};

/**
 * Primary customer surface: the conversation inside the storefront's panel. The host owns the
 * launcher, the outer panel and its size; this shell adds a compact header whose panel controls
 * are requests to the host (shown only after a validated host initialized the protocol).
 * Streaming continues while minimized; announcements and motion pause, and the host is told
 * about an unread answer so it can badge its launcher.
 */
export function EmbeddedShell({
  policy,
  supportUrl,
  allowedOrigins,
  initialTheme,
  initialPage,
}: Props) {
  const t = copy.es;
  const assistant = useAssistantInstance(policy);
  const state = useConversation(assistant);
  const host = useHostBridge(allowedOrigins, { theme: initialTheme, page: initialPage });

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = host.theme;
  }, [host.theme]);

  useEffect(() => {
    assistant.setPage(host.page);
  }, [assistant, host.page]);

  const { reportStatus, reportActivity } = host;
  useEffect(() => {
    reportStatus(
      state.session === "open"
        ? state.availability.status === "available"
          ? "ready"
          : "unavailable"
        : state.session === "failed"
          ? "unavailable"
          : "starting",
    );
  }, [state.session, state.availability.status, reportStatus]);

  // Activity: "responding" while a run is active; "unread" when one settles while hidden
  // (cleared when the panel is shown again); otherwise "idle".
  const running = state.pending !== null;
  const wasRunning = useRef(running);
  const unread = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && !host.visible) unread.current = true;
    if (host.visible) unread.current = false;
    wasRunning.current = running;
    reportActivity(running ? "responding" : unread.current ? "unread" : "idle");
  }, [running, host.visible, reportActivity]);

  return (
    <PresentationProvider
      value={{ t, locale: "es", policy, mode: "embed", supportUrl, visible: host.visible }}
    >
      <div
        data-panel-visible={host.visible}
        data-panel-expanded={host.expanded}
        className="flex h-dvh flex-col overflow-hidden bg-surface"
      >
        <header className="relative z-20 flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-surface ps-4 pe-2">
          <BrandMark size={32} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-title font-bold leading-tight">
              {t.assistantName}
            </h1>
            <p className="truncate text-tiny text-muted">{t.assistantTagline}</p>
          </div>
          <ClearControl
            disabled={running || state.messages.length === 0 || state.session !== "open"}
            clearing={state.clearing}
            onConfirm={() => void assistant.clear()}
          />
          {host.connected && host.canExpand && (
            <IconButton
              label={host.expanded ? t.restore : t.expand}
              aria-pressed={host.expanded}
              onClick={() => host.request(host.expanded ? "restore" : "expand")}
            >
              {host.expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </IconButton>
          )}
          {host.connected && (
            <IconButton label={t.minimize} onClick={() => host.request("minimize")}>
              <ChevronDown aria-hidden="true" />
            </IconButton>
          )}
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <ConversationView assistant={assistant} state={state} focusSignal={host.focusSignal} />
        </main>
      </div>
    </PresentationProvider>
  );
}
