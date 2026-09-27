/**
 * Conversation domain models. They mirror the public wire models of pequeverso-assistant-api
 * (`app/presentation/schemas.py`, `events.py`; revision pinned in contracts/source.json) after
 * validation, so presentation never touches raw payloads. Pure: no browser or network globals.
 */

export type Image = { url: string; width: number; height: number; alt: string };

/** Present only when the API confirms the price as current (`verified_at` within its freshness window). */
export type Price = {
  amount: string;
  currency: "USD";
  display: string;
  note: string;
  taxNote: string;
  verifiedAt: string;
};

export type Product = {
  id: string;
  name: string;
  summary: string;
  ageRange: string;
  url: string;
  purchaseUrl: string;
  image: Image | null;
  price: Price | null;
};

export type Resource = {
  id: string;
  productId: string;
  title: string;
  pages: number | null;
  description: string;
  image: Image | null;
};

export type Link = { id: string; label: string; url: string };
export type Source = { id: string; title: string; url: string };
export type Notice = "answer_replaced" | "payment_data_refused" | "contact_data_redacted";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  products: Product[];
  resources: Resource[];
  links: Link[];
  sources: Source[];
  followUps: string[];
  notices: Notice[];
};

/** Storefront page the visitor is on; the host tells the embed, the API uses it as context. */
export type Page = "home" | "product" | "support";

export type UnavailableReason = "assistant_disabled" | "catalog_unavailable" | "budget_exhausted";
export type Availability =
  | { status: "available" }
  | { status: "unavailable"; reason: UnavailableReason };

export type Limits = { maxMessageChars: number; messagesPerDay: number };

export type SessionSnapshot = {
  csrfToken: string;
  expiresAt: string;
  created: boolean;
  messages: Message[];
  availability: Availability;
  limits: Limits;
};

/** Every error code the API documents (`app/domain/errors.py`), plus transport-level failures. */
export type ErrorCode =
  | "invalid_request"
  | "origin_denied"
  | "csrf_failed"
  | "session_expired"
  | "rate_limited"
  | "busy"
  | "run_in_progress"
  | "idempotency_conflict"
  | "run_not_found"
  | "budget_exhausted"
  | "assistant_disabled"
  | "catalog_unavailable"
  | "provider_unavailable"
  | "generation_failed"
  | "timeout"
  | "dependency_unavailable"
  | "not_found"
  | "network"
  | "protocol";

export const ERROR_CODES: readonly ErrorCode[] = [
  "invalid_request",
  "origin_denied",
  "csrf_failed",
  "session_expired",
  "rate_limited",
  "busy",
  "run_in_progress",
  "idempotency_conflict",
  "run_not_found",
  "budget_exhausted",
  "assistant_disabled",
  "catalog_unavailable",
  "provider_unavailable",
  "generation_failed",
  "timeout",
  "dependency_unavailable",
  "not_found",
  "network",
  "protocol",
];

/** Events of one streamed run after validation (`POST /api/v1/messages`). */
export type RunEvent =
  | { type: "started"; runId: string; userMessage: Message | null }
  | { type: "delta"; text: string }
  | { type: "answer"; message: Message }
  | { type: "completed" }
  | { type: "failed"; code: ErrorCode; retryable: boolean }
  | { type: "cancelled" };
