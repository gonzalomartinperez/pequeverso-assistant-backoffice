"use client";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { copy } from "@/shared/i18n/copy";
import { BrandMark } from "@/shared/ui/brand-mark";
import { LinkButton } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import type { LinkPolicy } from "../domain/links";
import { useAssistantInstance } from "../entry";
import { ClearControl } from "./clear-control";
import { PresentationProvider } from "./context";
import { ConversationView } from "./conversation-view";
import { useConversation } from "./use-conversation";

export const THEME_STORAGE_KEY = "pv-assistant-theme";

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/**
 * Secondary surface for demonstrations and testing: the same conversation as the embed inside a
 * page frame with the store identity. It exposes no diagnostics or privileged controls.
 */
export function StandaloneShell({
  policy,
  supportUrl,
}: {
  policy: LinkPolicy;
  supportUrl: string;
}) {
  const t = copy.es;
  const assistant = useAssistantInstance(policy);
  const state = useConversation(assistant);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Blocked storage: the choice lasts for this page view only.
    }
  }

  return (
    <PresentationProvider
      value={{ t, locale: "es", policy, mode: "standalone", supportUrl, visible: true }}
    >
      <div className="flex h-dvh flex-col bg-surface">
        <header className="shrink-0 border-b border-line bg-surface">
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
            <a
              href={policy.storefrontOrigin}
              className="flex min-h-11 items-center gap-2.5 rounded-md no-underline"
              aria-label={`${t.brandWordmark} — ${t.backToStore}`}
            >
              <BrandMark size={40} />
              <span className="font-display text-2xl font-bold tracking-[-0.01em] text-ink">
                {t.brandWordmark}
              </span>
            </a>
            <span aria-hidden="true" className="hidden h-6 w-px bg-line-strong sm:block" />
            <h1 className="hidden font-sans text-small font-extrabold text-copy sm:block">
              {t.standaloneTitle}
            </h1>
            <div className="ms-auto flex items-center gap-1">
              <ClearControl
                disabled={
                  state.pending !== null || state.messages.length === 0 || state.session !== "open"
                }
                clearing={state.clearing}
                onConfirm={() => void assistant.clear()}
              />
              <IconButton
                label={theme === "dark" ? "Usar tema claro" : "Usar tema oscuro"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              </IconButton>
              <LinkButton
                href={policy.storefrontOrigin}
                variant="outline"
                size="sm"
                className="ms-1 hidden md:inline-flex"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                {t.backToStore}
              </LinkButton>
            </div>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <h1 className="sr-only sm:hidden">{t.standaloneTitle}</h1>
          <ConversationView assistant={assistant} state={state} focusSignal={0} />
          <p className="shrink-0 bg-veil px-4 pb-2 text-center text-tiny text-muted">
            {t.standaloneNote}
          </p>
        </main>
      </div>
    </PresentationProvider>
  );
}
