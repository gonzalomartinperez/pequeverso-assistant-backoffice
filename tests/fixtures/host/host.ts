// Reference host implementation (harness). The storefront will port this behavior into its own
// launcher; see docs/embed-integration.md. Protocol: pequeverso-assistant v1. Served to the
// browser by scripts/embed-host.ts with types stripped, so only erasable TypeScript is used.
const ASSISTANT_ORIGIN = "__ASSISTANT_ORIGIN__";
const CHANNEL = "pequeverso-assistant";
const VERSION = 1;
const READY_TIMEOUT_MS = 10_000;

type AssistantMessage =
  | { type: "assistant.ready"; status: "starting" | "ready" | "unavailable" }
  | { type: "assistant.activity"; state: "idle" | "responding" | "unread" }
  | { type: "assistant.request"; action: "minimize" | "expand" | "restore" };

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`harness element missing: ${selector}`);
  return found;
}

const panel = element<HTMLElement>("#panel");
const launcher = element<HTMLButtonElement>("#launcher");
const fallback = element<HTMLElement>("#fallback");
const statusOutput = element<HTMLOutputElement>("#status");
const badge = element<HTMLElement>("#badge");
const badgeText = element<HTMLElement>("#badge-text");
const themeSelect = element<HTMLSelectElement>("#theme");
const pageSelect = element<HTMLSelectElement>("#page");

const host = {
  frame: null as HTMLIFrameElement | null,
  initialized: false,
  ready: false,
  visible: false,
  expanded: false,
  pendingFocus: false,
  timer: 0,
  broken: false,
};
window.__harness = host; // test observability only

const preferences = () => ({ theme: themeSelect.value, locale: "es" });
const post = (message: Record<string, unknown>) =>
  host.frame?.contentWindow?.postMessage(
    { channel: CHANNEL, version: VERSION, ...message },
    ASSISTANT_ORIGIN,
  );
const sendState = () =>
  post({ type: "host.state", visible: host.visible, expanded: host.expanded });
const setStatus = (text: string) => {
  statusOutput.textContent = text;
};

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(value);
  return (
    own.length === keys.length + 3 &&
    ["channel", "version", "type", ...keys].every((key) => Object.hasOwn(value, key))
  );
}

function parseAssistantMessage(value: unknown): AssistantMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.channel !== CHANNEL || v.version !== VERSION) return null;
  if (
    v.type === "assistant.ready" &&
    exactKeys(v, ["status"]) &&
    (v.status === "starting" || v.status === "ready" || v.status === "unavailable")
  )
    return { type: v.type, status: v.status };
  if (
    v.type === "assistant.activity" &&
    exactKeys(v, ["state"]) &&
    (v.state === "idle" || v.state === "responding" || v.state === "unread")
  )
    return { type: v.type, state: v.state };
  if (
    v.type === "assistant.request" &&
    exactKeys(v, ["action"]) &&
    (v.action === "minimize" || v.action === "expand" || v.action === "restore")
  )
    return { type: v.type, action: v.action };
  return null;
}

function syncViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  document.documentElement.style.setProperty("--vv-height", `${viewport.height}px`);
  document.documentElement.style.setProperty("--vv-top", `${viewport.offsetTop}px`);
}
window.visualViewport?.addEventListener("resize", syncViewport);
window.visualViewport?.addEventListener("scroll", syncViewport);
syncViewport();

function focusChat() {
  if (!host.visible || !host.ready || !host.pendingFocus || !host.frame) return;
  host.pendingFocus = false;
  host.frame.focus(); // move focus into the frame first, so the assistant may focus its composer
  post({ type: "host.focus" });
}

function showFallback() {
  fallback.hidden = false;
  if (host.frame) host.frame.hidden = true;
  setStatus("Asistente no disponible");
  fallback.querySelector("button")?.focus();
}

function create() {
  clearTimeout(host.timer);
  host.initialized = false;
  host.ready = false;
  fallback.hidden = true;
  const frame = document.createElement("iframe");
  frame.title = "Asistente de compras Pequeverso";
  frame.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
  );
  frame.setAttribute("allow", "");
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  const query = new URLSearchParams({ theme: preferences().theme, page: pageSelect.value });
  frame.src = `${host.broken ? "http://localhost:3299" : ASSISTANT_ORIGIN}/embed?${query}`;
  host.frame = frame;
  panel.prepend(frame);
  setStatus("Conectando…");
  host.timer = window.setTimeout(() => {
    if (!host.initialized) showFallback();
  }, READY_TIMEOUT_MS);
}

function open() {
  host.visible = true;
  host.pendingFocus = true;
  panel.hidden = false;
  panel.inert = false;
  document.body.classList.add("panel-open");
  launcher.setAttribute("aria-expanded", "true");
  badge.hidden = true;
  badgeText.textContent = "";
  if (!host.frame) create();
  else {
    sendState();
    focusChat();
  }
}

function minimize() {
  host.visible = false;
  panel.hidden = true;
  panel.inert = true;
  document.body.classList.remove("panel-open");
  launcher.setAttribute("aria-expanded", "false");
  sendState();
  launcher.focus();
}

function setExpanded(expanded: boolean) {
  host.expanded = expanded;
  panel.classList.toggle("expanded", expanded);
  sendState();
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.origin !== ASSISTANT_ORIGIN || !host.frame || event.source !== host.frame.contentWindow)
    return;
  const message = parseAssistantMessage(event.data);
  if (!message) return;
  if (message.type === "assistant.ready") {
    if (!host.initialized) {
      host.initialized = true;
      clearTimeout(host.timer);
      post({
        type: "host.init",
        ...preferences(),
        visible: host.visible,
        expanded: host.expanded,
        page: pageSelect.value,
        canExpand: !matchMedia("(max-width: 639px)").matches,
      });
    }
    host.ready = message.status === "ready";
    setStatus(
      message.status === "ready"
        ? "Conectado"
        : message.status === "starting"
          ? "Conectando…"
          : "Asistente sin servicio (la tienda sigue funcionando)",
    );
    focusChat();
  } else if (message.type === "assistant.activity") {
    const unread = message.state === "unread" && !host.visible;
    badge.hidden = !unread;
    badgeText.textContent = unread ? "Nueva respuesta del asistente" : "";
  } else if (message.action === "minimize") minimize();
  else setExpanded(message.action === "expand");
});

launcher.addEventListener("click", open);
panel.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !panel.hidden) minimize();
});
// A deferred focus request is dropped if the visitor moves on meanwhile.
document.addEventListener("pointerdown", (event) => {
  if (event.target !== launcher) host.pendingFocus = false;
});
themeSelect.addEventListener("change", () => post({ type: "host.preferences", ...preferences() }));
pageSelect.addEventListener("change", () => post({ type: "host.context", page: pageSelect.value }));
element<HTMLButtonElement>("#retry").addEventListener("click", () => {
  host.frame?.remove();
  host.frame = null;
  host.broken = false;
  create();
  host.pendingFocus = true;
});
element<HTMLButtonElement>("#close-fallback").addEventListener("click", minimize);
element<HTMLButtonElement>("#broken").addEventListener("click", () => {
  host.broken = true;
  host.frame?.remove();
  host.frame = null;
  if (host.visible) create();
});
element<HTMLButtonElement>("#remove").addEventListener("click", () => {
  clearTimeout(host.timer);
  host.frame?.remove();
  host.frame = null;
  panel.remove();
  launcher.remove();
  setStatus("Asistente quitado: la página sigue funcionando");
});
element<HTMLButtonElement>("#invalid").addEventListener("click", () => {
  const target = host.frame?.contentWindow;
  if (!target) return;
  const bad: unknown[] = [
    { channel: CHANNEL, version: 2, type: "host.preferences", theme: "dark", locale: "es" },
    { channel: "other", version: VERSION, type: "host.preferences", theme: "dark", locale: "es" },
    {
      channel: CHANNEL,
      version: VERSION,
      type: "host.preferences",
      theme: "dark",
      locale: "es",
      extra: true,
    },
    { channel: CHANNEL, version: VERSION, type: "host.preferences", theme: "neon", locale: "es" },
    { channel: CHANNEL, version: VERSION, type: "host.state", visible: "yes", expanded: false },
    { channel: CHANNEL, version: VERSION, type: "host.navigate", target: "https://evil.example/" },
    "host.preferences",
    null,
  ];
  for (const message of bad) target.postMessage(message, ASSISTANT_ORIGIN);
  element<HTMLOutputElement>("#log").textContent = `sent ${bad.length} invalid messages`;
});
element<HTMLButtonElement>("#hostile").addEventListener("click", () => {
  // A sibling frame with an opaque origin tries to drive the assistant with a well-formed message.
  const evil = document.createElement("iframe");
  evil.hidden = true;
  evil.srcdoc = `<script>parent.frames[0].postMessage({channel:"${CHANNEL}",version:${VERSION},type:"host.preferences",theme:"dark",locale:"es"},"*");</script>`;
  document.body.append(evil);
});

declare global {
  interface Window {
    __harness?: typeof host;
  }
}

export {};
