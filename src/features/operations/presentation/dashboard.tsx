import { CircleAlert, CircleCheck, FlaskConical, TriangleAlert } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Callout } from "@/shared/ui/callout";
import { Facts, Section, TableRegion, td, th } from "@/shared/ui/sections";
import type { OpsReading } from "../application/ports";
import {
  acceptedRuns,
  budgetUse,
  catalogFreshness,
  hasTrend,
  type OpsSummary,
  percent,
  type RunWindow,
} from "../domain/summary";
import { DailyCharts } from "./daily-charts";
import * as f from "./format";

const UNAVAILABLE_READING: Record<Exclude<OpsReading, { status: "ok" }>["reason"], string> = {
  not_configured: "El backoffice no tiene configurada la conexión privada con la API.",
  unreachable: "La API no respondió a tiempo.",
  rejected: "La API rechazó la lectura (credencial o servicio).",
  invalid: "La API respondió con datos que no cumplen el contrato.",
};

export function Dashboard({ reading }: { reading: OpsReading }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-heading">Estado del asistente</h1>
        <p className="text-small text-muted">
          Lectura del {f.when(reading.fetchedAt)}. Sin contenido de conversaciones: solo agregados
          operativos.
        </p>
      </header>
      {reading.status === "ok" ? (
        <Summary summary={reading.summary} now={reading.fetchedAt} />
      ) : (
        <Callout tone="danger" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <p className="font-extrabold text-ink">Métricas no disponibles</p>
            <p>{UNAVAILABLE_READING[reading.reason]} Ningún valor se muestra como cero por esto.</p>
          </div>
        </Callout>
      )}
    </div>
  );
}

function Summary({ summary, now }: { summary: OpsSummary; now: Date }) {
  return (
    <>
      {summary.service.synthetic ? (
        <Callout tone="notice" role="note" data-testid="synthetic-banner">
          <FlaskConical aria-hidden="true" />
          <p>
            <strong>Datos sintéticos (fixture).</strong> La API usa el proveedor de prueba: las
            cifras de uso y costo no representan consumo real de OpenAI.
          </p>
        </Callout>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Availability summary={summary} />
        <Service summary={summary} />
        <Catalog summary={summary} now={now} />
      </div>
      <Budget summary={summary} />
      {summary.windows.length ? (
        summary.windows.map((window) => <Runs key={window.hours} window={window} />)
      ) : (
        <Section id="runs" title="Solicitudes">
          <p className="text-small text-copy">
            {f.UNAVAILABLE}: la API todavía no registra métricas de ejecución.
          </p>
        </Section>
      )}
      <Daily summary={summary} />
      <p className="text-tiny text-muted">
        Métricas registradas desde: {f.when(summary.metricsSince)}. Resumen generado por la API el{" "}
        {f.when(summary.generatedAt)}.
      </p>
    </>
  );
}

function Availability({ summary }: { summary: OpsSummary }) {
  const available = summary.availability.status === "available";
  return (
    <Section id="availability" title="Disponibilidad">
      <p className="flex items-center gap-2 text-title text-ink">
        {available ? (
          <CircleCheck aria-hidden="true" className="size-5 text-icon" />
        ) : (
          <TriangleAlert aria-hidden="true" className="size-5 text-danger" />
        )}
        {available ? "Acepta preguntas" : "No acepta preguntas"}
      </p>
      {!available ? (
        <p className="mt-2 text-small text-copy">{f.reason(summary.availability.reason)}</p>
      ) : null}
      <p className="mt-3 text-tiny text-muted">
        Asistente habilitado en la API:{" "}
        {summary.service.assistantEnabled == null
          ? f.UNAVAILABLE
          : summary.service.assistantEnabled
            ? "sí"
            : "no"}
        . La tienda tiene su propio interruptor y no se lee desde aquí.
      </p>
    </Section>
  );
}

function Service({ summary }: { summary: OpsSummary }) {
  const s = summary.service;
  return (
    <Section id="service" title="Servicio">
      <Facts
        items={[
          { term: "Modelo", value: s.model ?? f.UNAVAILABLE },
          { term: "Esfuerzo de razonamiento", value: s.reasoningEffort ?? f.UNAVAILABLE },
          { term: "Proveedor", value: s.provider ?? f.UNAVAILABLE },
          { term: "Entorno", value: s.environment ?? f.UNAVAILABLE },
          { term: "Revisión", value: <code>{s.revision ?? f.UNAVAILABLE}</code> },
          { term: "En marcha desde", value: f.when(s.startedAt) },
        ]}
      />
    </Section>
  );
}

function Catalog({ summary, now }: { summary: OpsSummary; now: Date }) {
  const c = summary.catalog;
  const freshness = catalogFreshness(summary, now);
  return (
    <Section id="catalog" title="Catálogo">
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone={c.status === "active" ? "chip" : "notice"}>
          {c.status === "active" ? "Activo" : "Sin catálogo válido"}
        </Badge>
        <Badge tone={freshness === "fresh" ? "chip" : "notice"}>
          {freshness === "fresh"
            ? "Precios vigentes"
            : freshness === "stale"
              ? "Precios vencidos: no se citan"
              : "Frescura no disponible"}
        </Badge>
      </div>
      <Facts
        items={[
          { term: "Revisión de la tienda", value: <code>{c.revision ?? f.UNAVAILABLE}</code> },
          {
            term: "Origen",
            value:
              c.source === "live"
                ? "Publicado (remoto)"
                : c.source === "bundled"
                  ? "Instantánea empaquetada"
                  : f.UNAVAILABLE,
          },
          { term: "Verificado", value: f.age(c.verifiedAt, now), hint: f.when(c.verifiedAt) },
          {
            term: "Ventana de precios",
            value: c.priceMaxAgeHours == null ? f.UNAVAILABLE : `${f.count(c.priceMaxAgeHours)} h`,
          },
          { term: "Último intento de sincronización", value: f.when(c.lastAttemptAt) },
          {
            term: "Último error de sincronización",
            value: c.lastFailure ?? "Ninguno registrado",
            ...(c.lastFailureAt ? { hint: f.when(c.lastFailureAt) } : {}),
          },
          { term: "Activado", value: f.when(c.activatedAt) },
          { term: "Productos", value: f.count(c.products) },
          { term: "Documentos", value: f.count(c.documents) },
        ]}
      />
    </Section>
  );
}

function Budget({ summary }: { summary: OpsSummary }) {
  const b = summary.budget;
  if (!b)
    return (
      <Section id="budget" title="Presupuesto">
        <p className="text-small text-copy">
          {f.UNAVAILABLE}: la API no informó el estado del presupuesto.
        </p>
      </Section>
    );
  const use = budgetUse(summary);
  return (
    <Section
      id="budget"
      title={`Presupuesto de ${b.month ?? "este mes"}`}
      description="Confirmado: costo calculado con el uso informado por el proveedor. Estimado: ejecuciones sin informe de uso; se conserva la reserva de peor caso. Pendiente: reservas de ejecuciones en curso."
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-small">
          <span className="font-extrabold text-ink">Comprometido del límite mensual</span>
          <span className="tabular-nums text-ink">{f.pct(use)}</span>
        </div>
        {use == null ? null : (
          <div
            role="meter"
            aria-label="Uso del presupuesto mensual"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(use, 100)}
            aria-valuetext={f.pct(use)}
            className="h-3 w-full overflow-hidden rounded-pill bg-surface-sunken"
          >
            <div
              className={`h-full rounded-pill ${use >= 90 ? "bg-danger" : "bg-icon"}`}
              style={{ width: `${Math.min(Math.max(use, 1), 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="mt-4">
        <TableRegion label="Gasto del mes y del día">
          <table className="mt-0 w-full border-collapse">
            <caption className="sr-only">Gasto del asistente por estado, en dólares</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Período
                </th>
                <th scope="col" className={th}>
                  Confirmado
                </th>
                <th scope="col" className={th}>
                  Estimado
                </th>
                <th scope="col" className={th}>
                  Pendiente
                </th>
                <th scope="col" className={th}>
                  Límite
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className={`${td} text-left font-extrabold`}>
                  Mes
                </th>
                <td className={td}>{f.usd(b.monthSpend.confirmed)}</td>
                <td className={td}>{f.usd(b.monthSpend.estimated)}</td>
                <td className={td}>{f.usd(b.monthSpend.pending)}</td>
                <td className={td}>{f.usd(b.monthlyLimit)}</td>
              </tr>
              <tr>
                <th scope="row" className={`${td} text-left font-extrabold`}>
                  Hoy ({b.day ?? f.UNAVAILABLE})
                </th>
                <td className={td}>{f.usd(b.daySpend.confirmed)}</td>
                <td className={td}>{f.usd(b.daySpend.estimated)}</td>
                <td className={td}>{f.usd(b.daySpend.pending)}</td>
                <td className={td}>{f.usd(b.dailyLimit)}</td>
              </tr>
            </tbody>
          </table>
        </TableRegion>
      </div>
      <p className="mt-3 text-small text-copy">
        Corte de seguridad mensual: {f.usd(b.monthlyCutoff)}. Restante antes del límite:{" "}
        {f.usd(b.remainingMonth)}.
      </p>
    </Section>
  );
}

function Runs({ window }: { window: RunWindow }) {
  const r = window.runs;
  const accepted = acceptedRuns(r);
  const success = percent(r.completed, accepted);
  const failures = Object.entries(window.failures).sort((a, b) => b[1] - a[1]);
  const t = window.tokens;
  return (
    <Section
      id={`runs-${window.hours}`}
      title={`Solicitudes · ${f.windowLabel(window.hours)}`}
      description="Aceptada: la API empezó a responder. Interrumpida: la conexión se cortó antes del final y no cuenta como completada. Rechazada: no llegó a responder (presupuesto, capacidad o límites)."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Facts
          items={[
            { term: "Aceptadas", value: f.count(accepted) },
            {
              term: "Completadas",
              value: f.count(r.completed),
              hint: `Éxito sobre aceptadas: ${f.pct(success)}`,
            },
            { term: "Fallidas", value: f.count(r.failed) },
            { term: "Canceladas", value: f.count(r.cancelled) },
            { term: "Interrumpidas", value: f.count(r.interrupted) },
            { term: "Rechazadas antes de responder", value: f.count(r.refused) },
            { term: "Respuestas reemplazadas por reglas", value: f.count(window.replaced) },
          ]}
        />
        <div className="flex flex-col gap-4">
          <Facts
            items={[
              {
                term: "Primer texto (p50 / p95)",
                value: window.latency.firstDelta
                  ? `${f.ms(window.latency.firstDelta.p50)} / ${f.ms(window.latency.firstDelta.p95)}`
                  : f.UNAVAILABLE,
                hint: "Desde que la API acepta la pregunta hasta el primer fragmento enviado.",
              },
              {
                term: "Respuesta completa (p50 / p95)",
                value: window.latency.total
                  ? `${f.ms(window.latency.total.p50)} / ${f.ms(window.latency.total.p95)}`
                  : f.UNAVAILABLE,
                hint: "Hasta la respuesta final validada, solo ejecuciones completadas.",
              },
              {
                term: "Tokens de entrada (en caché)",
                value: `${f.tokens(t.input)} (${f.tokens(t.cachedInput)})`,
              },
              {
                term: "Tokens de salida (razonamiento)",
                value: `${f.tokens(t.output)} (${f.tokens(t.reasoning)})`,
              },
            ]}
          />
          {failures.length ? (
            <TableRegion label={`Fallos por código, ${f.windowLabel(window.hours)}`}>
              <table className="w-full border-collapse">
                <caption className="sr-only">Fallos por código público</caption>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      Código
                    </th>
                    <th scope="col" className={th}>
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map(([code, n]) => (
                    <tr key={code}>
                      <th scope="row" className={`${td} text-left font-normal`}>
                        <code>{code}</code> · {f.reason(code)}
                      </th>
                      <td className={td}>{f.count(n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableRegion>
          ) : (
            <p className="text-small text-copy">Sin fallos registrados en esta ventana.</p>
          )}
        </div>
      </div>
    </Section>
  );
}

function Daily({ summary }: { summary: OpsSummary }) {
  const rows = summary.daily;
  return (
    <Section
      id="daily"
      title="Actividad diaria"
      description="Solo días con registros; un día ausente no se interpreta como cero."
    >
      {rows.length === 0 ? (
        <p className="text-small text-copy">{f.UNAVAILABLE}: todavía no hay días con registros.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {hasTrend(rows) ? (
            <DailyCharts
              rows={rows.map((row) => ({
                day: f.day(row.day),
                completed: row.completed,
                failed: row.failed,
                cancelled: row.cancelled,
                interrupted: row.interrupted,
                confirmed: row.confirmed == null ? null : Number(row.confirmed),
                estimated: row.estimated == null ? null : Number(row.estimated),
              }))}
            />
          ) : (
            <p className="text-small text-copy">
              Hay una sola lectura diaria: se muestra como tabla, sin tendencia.
            </p>
          )}
          <TableRegion label="Actividad diaria en tabla">
            <table className="w-full border-collapse">
              <caption className="sr-only">Ejecuciones, costo y tokens por día (UTC)</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Día (UTC)
                  </th>
                  <th scope="col" className={th}>
                    Completadas
                  </th>
                  <th scope="col" className={th}>
                    Fallidas
                  </th>
                  <th scope="col" className={th}>
                    Canceladas
                  </th>
                  <th scope="col" className={th}>
                    Interrumpidas
                  </th>
                  <th scope="col" className={th}>
                    Rechazadas
                  </th>
                  <th scope="col" className={th}>
                    Confirmado
                  </th>
                  <th scope="col" className={th}>
                    Estimado
                  </th>
                  <th scope="col" className={th}>
                    Tokens entrada / salida
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.day}>
                    <th scope="row" className={`${td} text-left font-extrabold`}>
                      {f.day(row.day)}
                    </th>
                    <td className={td}>{f.count(row.completed)}</td>
                    <td className={td}>{f.count(row.failed)}</td>
                    <td className={td}>{f.count(row.cancelled)}</td>
                    <td className={td}>{f.count(row.interrupted)}</td>
                    <td className={td}>{f.count(row.refused)}</td>
                    <td className={td}>{f.usd(row.confirmed)}</td>
                    <td className={td}>{f.usd(row.estimated)}</td>
                    <td className={td}>
                      {f.tokens(row.inputTokens)} / {f.tokens(row.outputTokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        </div>
      )}
    </Section>
  );
}
