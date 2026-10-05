import type { Money } from "../domain/summary.ts";

/** Spanish display helpers. Every function renders `null` as the same honest placeholder. */
export const UNAVAILABLE = "No disponible";

const integer = new Intl.NumberFormat("es", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const dayFormat = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function count(value: number | null): string {
  return value == null ? UNAVAILABLE : integer.format(value);
}

export function tokens(value: number | null): string {
  return value == null ? UNAVAILABLE : compact.format(value);
}

/** USD with enough decimals for sub-cent model costs (4 below one dollar, 2 above). */
export function usd(value: Money): string {
  if (value == null) return UNAVAILABLE;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return UNAVAILABLE;
  const digits = Math.abs(amount) < 1 ? 4 : 2;
  return `US$ ${new Intl.NumberFormat("es", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)}`;
}

export function when(value: Date | null): string {
  return value == null ? UNAVAILABLE : `${dateTime.format(value)} UTC`;
}

export function day(value: string): string {
  return dayFormat.format(new Date(`${value}T00:00:00Z`));
}

export function ms(value: number | null): string {
  if (value == null) return UNAVAILABLE;
  return value >= 1000
    ? `${new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(value / 1000)} s`
    : `${integer.format(value)} ms`;
}

export function pct(value: number | null): string {
  return value == null
    ? UNAVAILABLE
    : `${new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(value)} %`;
}

/** Relative age ("hace 3 h") for freshness, from a fixed reading time. */
export function age(value: Date | null, now: Date): string {
  if (value == null) return UNAVAILABLE;
  const minutes = Math.round((now.getTime() - value.getTime()) / 60_000);
  if (minutes < 1) return "hace menos de 1 min";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

const REASONS: Record<string, string> = {
  assistant_disabled: "El asistente está desactivado",
  catalog_unavailable: "No hay un catálogo válido activo",
  budget_exhausted: "Se alcanzó el presupuesto",
  provider_unavailable: "Proveedor del modelo no disponible",
  generation_failed: "La respuesta no se pudo generar",
  timeout: "Tiempo de respuesta agotado",
  busy: "Capacidad ocupada",
};

export function reason(code: string | null): string {
  if (code == null) return "Sin motivo informado";
  return REASONS[code] ?? code;
}

export function windowLabel(hours: number): string {
  if (hours === 24) return "Últimas 24 horas";
  if (hours % 24 === 0) return `Últimos ${hours / 24} días`;
  return `Últimas ${hours} horas`;
}
