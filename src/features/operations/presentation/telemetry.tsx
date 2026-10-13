import { Activity, CircleCheck, FlaskConical, TriangleAlert } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Callout } from "@/shared/ui/callout";
import { Facts, Section } from "@/shared/ui/sections";
import type { TelemetryReading } from "../application/ports";
import * as f from "./format";

function bytes(value: number | null): string {
  return value == null
    ? f.UNAVAILABLE
    : `${new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(value / 1_048_576)} MiB`;
}
function lifetime(seconds: number): string {
  return seconds < 60
    ? `${f.count(Math.floor(seconds))} s`
    : seconds < 3600
      ? `${f.count(Math.floor(seconds / 60))} min`
      : `${new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(seconds / 3600)} h`;
}

export function Telemetry({ reading }: { reading: TelemetryReading }) {
  if (reading.status !== "ok")
    return (
      <Section
        id="telemetry"
        title="Estado técnico"
        description="Lectura opcional e independiente del resumen de negocio."
      >
        <p className="text-small text-copy">
          <strong>{f.UNAVAILABLE}.</strong>{" "}
          {reading.reason === "disabled"
            ? "La telemetría privada está desactivada o este productor todavía no la ofrece."
            : "No se pudo obtener una muestra técnica válida."}{" "}
          El resumen de solicitudes y presupuesto sigue disponible si la API lo informa.
        </p>
        <p className="mt-2 text-tiny text-muted">
          No se infiere que el servicio esté caído por la ausencia de esta lectura.
        </p>
      </Section>
    );
  const t = reading.telemetry;
  const resource = t.resources;
  return (
    <Section
      id="telemetry"
      title="Estado técnico"
      description={`Muestra del ${f.when(t.generatedAt)}. Es una observación puntual; no mide uptime del proveedor.`}
    >
      {t.synthetic ? (
        <Callout tone="notice" role="note" data-testid="telemetry-fixture-banner">
          <FlaskConical aria-hidden="true" />
          <p>
            <strong>Proveedor de prueba (fixture).</strong> La muestra informa HTTP y recursos del
            proceso; no acredita disponibilidad de OpenAI ni calidad del modelo.
          </p>
        </Callout>
      ) : null}
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-md bg-surface-sunken p-4">
          <p className="flex items-center gap-2 font-extrabold text-ink">
            {t.readiness.ready ? (
              <CircleCheck aria-hidden="true" className="size-5 text-icon" />
            ) : (
              <TriangleAlert aria-hidden="true" className="size-5 text-danger" />
            )}
            API {t.readiness.ready ? "preparada" : "no preparada"}
          </p>
          <p className="mt-2 text-small text-copy">
            Comprobación local de la API, independiente de que el asistente esté habilitado.
          </p>
          <p className="mt-2 text-tiny text-muted">Comprobada: {f.when(t.readiness.checkedAt)}</p>
        </div>
        <div className="rounded-md bg-surface-sunken p-4">
          <p className="flex items-center gap-2 font-extrabold text-ink">
            <Activity aria-hidden="true" className="size-5 text-icon" />
            {f.count(t.activeRuns)} / {f.count(t.maxConcurrentRuns)} ejecuciones activas
          </p>
          <p className="mt-2 text-small text-copy">
            Capacidad simultánea configurada, no una garantía de rendimiento.
          </p>
          <p className="mt-2 text-tiny text-muted">
            Proceso en marcha: {lifetime(t.processUptimeSeconds)}
          </p>
        </div>
        <div className="rounded-md bg-surface-sunken p-4">
          <Badge tone="quiet">Proveedor: sin comprobar</Badge>
          <p className="mt-2 text-small text-copy">
            No se envían preguntas ni llamadas pagas para comprobarlo. Una API preparada no acredita
            que el modelo responda.
          </p>
        </div>
      </div>
      <details className="mt-5 rounded-md border border-line p-4">
        <summary className="min-h-11 cursor-pointer [overflow-wrap:anywhere] font-extrabold text-link focus-visible:outline-3 focus-visible:outline-ring">
          Recursos, tráfico y exportación de trazas
        </summary>
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-title">Proceso y cgroup</h3>
            <Facts
              items={[
                { term: "Memoria RSS del proceso", value: bytes(resource.processRssBytes) },
                { term: "Pico RSS del proceso", value: bytes(resource.processPeakRssBytes) },
                {
                  term: "Memoria actual del cgroup",
                  value: bytes(resource.cgroupMemoryCurrentBytes),
                },
                {
                  term: "Límite de memoria del cgroup",
                  value: bytes(resource.cgroupMemoryLimitBytes),
                },
                {
                  term: "Límite de CPU del cgroup",
                  value:
                    resource.cgroupCpuLimitCores == null
                      ? f.UNAVAILABLE
                      : `${resource.cgroupCpuLimitCores} CPU`,
                },
                {
                  term: "PIDs actuales / límite",
                  value: `${f.count(resource.cgroupPidsCurrent)} / ${f.count(resource.cgroupPidsLimit)}`,
                },
              ]}
            />
            <p className="mt-3 text-tiny text-muted">
              El cgroup puede incluir otros procesos. Sus límites no son una reserva exclusiva del
              asistente; RSS y memoria del cgroup son métricas diferentes.
            </p>
          </div>
          <div>
            <h3 className="mb-3 text-title">HTTP y trazas</h3>
            <Facts
              items={[
                { term: "Solicitudes HTTP", value: f.count(t.http.requests) },
                { term: "Errores HTTP 5xx", value: f.count(t.http.serverErrors) },
                { term: "Solicitudes HTTP en curso", value: f.count(t.http.inflight) },
                {
                  term: "Exportación de trazas",
                  value: t.traces.enabled ? "Activada" : "Desactivada",
                },
                { term: "Muestreo configurado", value: f.pct(t.traces.samplingRatio * 100) },
                {
                  term: "Exportaciones correctas / fallidas",
                  value: `${f.count(t.traces.exportSuccesses)} / ${f.count(t.traces.exportFailures)}`,
                },
                { term: "Último intento de exportación", value: f.when(t.traces.lastExportAt) },
                {
                  term: "Resultado del último intento",
                  value:
                    t.traces.lastExportSuccess === null
                      ? f.UNAVAILABLE
                      : t.traces.lastExportSuccess
                        ? "Correcto"
                        : "Fallido",
                },
              ]}
            />
            <p className="mt-3 text-tiny text-muted">
              Contadores desde {f.when(t.processStartedAt)}: se reinician con el proceso. Los
              errores 5xx no incluyen fallos SSE enviados dentro de HTTP 200; consulta Solicitudes
              para los resultados del asistente. Las trazas son best effort, no un registro
              duradero.
            </p>
          </div>
        </div>
      </details>
    </Section>
  );
}
