/**
 * Host ⇄ assistant postMessage protocol, version 1 (docs/embed-integration.md,
 * contracts/embed.v1.schema.json). Messages are flat objects with an exact key set; anything else
 * is dropped. The protocol carries coordination only: never credentials, CSRF tokens, message
 * text, product data or transcripts. Pure: no window access here.
 */
import type { Page } from "../assistant/domain/models.ts";

export const CHANNEL = "pequeverso-assistant";
export const VERSION = 1;

export type Theme = "light" | "dark";
export type Locale = "es";
export type PanelState = { visible: boolean; expanded: boolean };

export type HostMessage =
  | {
      type: "host.init";
      theme: Theme;
      locale: Locale;
      visible: boolean;
      expanded: boolean;
      page: Page | null;
      /** Whether the host panel supports an expanded size (the assistant then offers the control). */
      canExpand: boolean;
    }
  | { type: "host.state"; visible: boolean; expanded: boolean }
  | { type: "host.preferences"; theme: Theme; locale: Locale }
  | { type: "host.context"; page: Page | null }
  | { type: "host.focus" };

export type ReadyStatus = "starting" | "ready" | "unavailable";
/** `unread`: an answer completed while the panel was hidden (host may badge its launcher). */
export type Activity = "idle" | "responding" | "unread";
export type PanelAction = "minimize" | "expand" | "restore";

export type AssistantMessage =
  | { type: "assistant.ready"; status: ReadyStatus }
  | { type: "assistant.activity"; state: Activity }
  | { type: "assistant.request"; action: PanelAction };

export type Envelope<T> = T & { channel: typeof CHANNEL; version: typeof VERSION };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return (
    own.length === keys.length + 3 &&
    ["channel", "version", "type", ...keys].every((k) => Object.hasOwn(value, k))
  );
}

const bool = (value: unknown): value is boolean => typeof value === "boolean";
const theme = (value: unknown): value is Theme => value === "light" || value === "dark";
const locale = (value: unknown): value is Locale => value === "es";
const page = (value: unknown): value is Page | null =>
  value === null || value === "home" || value === "product" || value === "support";

/** Returns a well-formed host message or null. Origin and source checks happen in the bridge. */
export function parseHostMessage(value: unknown): HostMessage | null {
  if (!record(value) || value.channel !== CHANNEL || value.version !== VERSION) return null;
  const v = value;
  switch (v.type) {
    case "host.init":
      return exact(v, ["theme", "locale", "visible", "expanded", "page", "canExpand"]) &&
        theme(v.theme) &&
        locale(v.locale) &&
        bool(v.visible) &&
        bool(v.expanded) &&
        page(v.page) &&
        bool(v.canExpand)
        ? {
            type: "host.init",
            theme: v.theme,
            locale: v.locale,
            visible: v.visible,
            expanded: v.expanded,
            page: v.page,
            canExpand: v.canExpand,
          }
        : null;
    case "host.state":
      return exact(v, ["visible", "expanded"]) && bool(v.visible) && bool(v.expanded)
        ? { type: "host.state", visible: v.visible, expanded: v.expanded }
        : null;
    case "host.preferences":
      return exact(v, ["theme", "locale"]) && theme(v.theme) && locale(v.locale)
        ? { type: "host.preferences", theme: v.theme, locale: v.locale }
        : null;
    case "host.context":
      return exact(v, ["page"]) && page(v.page) ? { type: "host.context", page: v.page } : null;
    case "host.focus":
      return exact(v, []) ? { type: "host.focus" } : null;
    default:
      return null;
  }
}

/** Mirror validator used by the reference host (harness) and by tests. */
export function parseAssistantMessage(value: unknown): AssistantMessage | null {
  if (!record(value) || value.channel !== CHANNEL || value.version !== VERSION) return null;
  const v = value;
  switch (v.type) {
    case "assistant.ready":
      return exact(v, ["status"]) &&
        (v.status === "starting" || v.status === "ready" || v.status === "unavailable")
        ? { type: "assistant.ready", status: v.status }
        : null;
    case "assistant.activity":
      return exact(v, ["state"]) &&
        (v.state === "idle" || v.state === "responding" || v.state === "unread")
        ? { type: "assistant.activity", state: v.state }
        : null;
    case "assistant.request":
      return exact(v, ["action"]) &&
        (v.action === "minimize" || v.action === "expand" || v.action === "restore")
        ? { type: "assistant.request", action: v.action }
        : null;
    default:
      return null;
  }
}

export function envelope<T extends HostMessage | AssistantMessage>(message: T): Envelope<T> {
  return { channel: CHANNEL, version: VERSION, ...message };
}

/**
 * Parses EMBED_ALLOWED_ORIGINS: comma-separated exact origins, at most 8, https only (plain http
 * only for localhost/127.0.0.1 test hosts). Wildcards, paths and credentials are rejected so the
 * same list can be used for `frame-ancestors` and for postMessage origin checks.
 */
export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length > 8) throw new Error("EMBED_ALLOWED_ORIGINS accepts at most 8 origins");
  return [
    ...new Set(
      entries.map((origin) => {
        let url: URL;
        try {
          url = new URL(origin);
        } catch {
          throw new Error(`Invalid embed origin: ${origin}`);
        }
        const local =
          url.protocol === "http:" &&
          (url.hostname === "localhost" || url.hostname === "127.0.0.1");
        if (
          origin.includes("*") ||
          url.origin !== origin ||
          url.username ||
          url.password ||
          (url.protocol !== "https:" && !local)
        )
          throw new Error(`Invalid embed origin: ${origin}`);
        return origin;
      }),
    ),
  ];
}
