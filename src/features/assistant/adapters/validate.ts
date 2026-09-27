/**
 * Runtime validation of API payloads (wire models in pequeverso-assistant-api
 * `app/presentation/schemas.py`). The API forbids extra fields on its side; here, unknown fields
 * are ignored for forward compatibility but every consumed field is type- and size-checked.
 * Anything malformed is a protocol error, never rendered.
 */
import type {
  Availability,
  Image,
  Limits,
  Link,
  Message,
  Notice,
  Price,
  Product,
  Resource,
  SessionSnapshot,
  Source,
} from "../domain/models.ts";

export class PayloadError extends Error {
  override readonly name = "PayloadError";
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(what: string): never {
  throw new PayloadError(`Invalid ${what}`);
}

function text(value: unknown, what: string, max: number, min = 1): string {
  if (typeof value !== "string" || value.length < min || value.length > max) invalid(what);
  return value;
}

function integer(value: unknown, what: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    invalid(what);
  return value;
}

function list<T>(value: unknown, what: string, max: number, item: (entry: unknown) => T): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) invalid(what);
  return value.map(item);
}

function object(value: unknown, what: string): Record<string, unknown> {
  if (!record(value)) invalid(what);
  return value;
}

function timestamp(value: unknown, what: string): string {
  const raw = text(value, what, 64);
  if (Number.isNaN(Date.parse(raw))) invalid(what);
  return raw;
}

function image(value: unknown): Image | null {
  if (value === null || value === undefined) return null;
  const v = object(value, "image");
  return {
    url: text(v.url, "image url", 2048),
    width: integer(v.width, "image width", 1, 10_000),
    height: integer(v.height, "image height", 1, 10_000),
    alt: text(v.alt, "image alt", 300, 0),
  };
}

function price(value: unknown): Price | null {
  if (value === null || value === undefined) return null;
  const v = object(value, "price");
  if (v.currency !== "USD") invalid("price currency");
  const amount = text(v.amount, "price amount", 16);
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(amount)) invalid("price amount");
  return {
    amount,
    currency: "USD",
    display: text(v.display, "price display", 40),
    note: text(v.note, "price note", 400),
    taxNote: text(v.tax_note, "price tax note", 200),
    verifiedAt: timestamp(v.verified_at, "price verified_at"),
  };
}

const ID = /^[a-z0-9][a-z0-9./-]{0,128}$/;

function id(value: unknown, what: string): string {
  const raw = text(value, what, 129);
  if (!ID.test(raw)) invalid(what);
  return raw;
}

function product(value: unknown): Product {
  const v = object(value, "product");
  return {
    id: id(v.id, "product id"),
    name: text(v.name, "product name", 200),
    summary: text(v.summary, "product summary", 1500),
    ageRange: text(v.age_range, "product age range", 200),
    url: text(v.url, "product url", 2048),
    purchaseUrl: text(v.purchase_url, "product purchase url", 2048),
    image: image(v.image),
    price: price(v.price),
  };
}

function resource(value: unknown): Resource {
  const v = object(value, "resource");
  return {
    id: id(v.id, "resource id"),
    productId: id(v.product_id, "resource product id"),
    title: text(v.title, "resource title", 200),
    pages: v.pages === null ? null : integer(v.pages, "resource pages", 1, 10_000),
    description: text(v.description, "resource description", 1500),
    image: image(v.image),
  };
}

function link(value: unknown): Link {
  const v = object(value, "link");
  return {
    id: text(v.id, "link id", 129),
    label: text(v.label, "link label", 200),
    url: text(v.url, "link url", 2048),
  };
}

function source(value: unknown): Source {
  const v = object(value, "source");
  return {
    id: text(v.id, "source id", 129),
    title: text(v.title, "source title", 200),
    url: text(v.url, "source url", 2048),
  };
}

const NOTICES: readonly Notice[] = [
  "answer_replaced",
  "payment_data_refused",
  "contact_data_redacted",
];

function notice(value: unknown): Notice {
  const known = NOTICES.find((entry) => entry === value);
  return known ?? invalid("notice");
}

export function parseMessage(value: unknown): Message {
  const v = object(value, "message");
  if (v.role !== "user" && v.role !== "assistant") invalid("message role");
  return {
    id: text(v.id, "message id", 128),
    role: v.role,
    content: text(v.content, "message content", 20_000, 0),
    createdAt: timestamp(v.created_at, "message created_at"),
    products: list(v.products, "products", 20, product),
    resources: list(v.resources, "resources", 40, resource),
    links: list(v.links, "links", 20, link),
    sources: list(v.sources, "sources", 20, source),
    followUps: list(v.follow_ups, "follow-ups", 6, (entry) => text(entry, "follow-up", 200)),
    notices: list(v.notices, "notices", 3, notice),
  };
}

const REASONS = ["assistant_disabled", "catalog_unavailable", "budget_exhausted"] as const;

function availability(value: unknown): Availability {
  const v = object(value, "availability");
  if (v.status === "available") return { status: "available" };
  const reason = REASONS.find((entry) => entry === v.reason);
  if (v.status !== "unavailable") invalid("availability status");
  // An unknown reason still means unavailable; report the most conservative one.
  return { status: "unavailable", reason: reason ?? "assistant_disabled" };
}

function limits(value: unknown): Limits {
  const v = object(value, "limits");
  return {
    maxMessageChars: integer(v.max_message_chars, "max_message_chars", 1, 20_000),
    messagesPerDay: integer(v.messages_per_day, "messages_per_day", 1, 100_000),
  };
}

export function parseSession(value: unknown): SessionSnapshot {
  const v = object(value, "session");
  if (v.schema_version !== "1") invalid("session schema_version");
  if (typeof v.created !== "boolean") invalid("session created");
  return {
    csrfToken: text(v.csrf_token, "csrf token", 512),
    expiresAt: timestamp(v.expires_at, "session expires_at"),
    created: v.created,
    messages: list(v.messages, "messages", 200, parseMessage),
    availability: availability(v.availability),
    limits: limits(v.limits),
  };
}

/** `{ "error": { code, message, retryable, request_id } }`; returns null when not that shape. */
export function parseErrorBody(value: unknown): { code: string; retryable: boolean } | null {
  if (!record(value) || !record(value.error)) return null;
  const { code, retryable } = value.error;
  return typeof code === "string" && typeof retryable === "boolean" ? { code, retryable } : null;
}
