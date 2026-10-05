"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartRow = {
  day: string;
  completed: number | null;
  failed: number | null;
  cancelled: number | null;
  interrupted: number | null;
  confirmed: number | null;
  estimated: number | null;
};

const axis = { stroke: "var(--muted)", fontSize: 12 };
const tooltip = {
  contentStyle: {
    background: "var(--surface-raised)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    color: "var(--ink)",
  },
  cursor: { fill: "var(--line)" },
};

const legendStyle = { fontSize: 12 };
/** Legend text in the reading colour: series colours (gold) are not legible as text. */
const legendLabel = (value: string) => <span style={{ color: "var(--body)" }}>{value}</span>;

/**
 * Daily trends (client only; Recharts). The table next to the charts carries the same data for
 * assistive technology, so the SVG is hidden from it and the keyboard layer is off. Missing
 * values stay gaps (null), they are not drawn as zero. No animation: values appear at once.
 */
export function DailyCharts({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <figure className="m-0">
        <figcaption className="mb-2 text-small font-extrabold text-ink">
          Ejecuciones por día
        </figcaption>
        <div aria-hidden="true" className="h-64 w-full" data-testid="chart-runs">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              accessibilityLayer={false}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={axis}
                tickLine={false}
                axisLine={{ stroke: "var(--line-strong)" }}
              />
              <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip {...tooltip} />
              <Legend wrapperStyle={legendStyle} formatter={legendLabel} />
              <Bar
                dataKey="completed"
                name="Completadas"
                stackId="runs"
                fill="var(--chart-completed)"
                isAnimationActive={false}
              />
              <Bar
                dataKey="failed"
                name="Fallidas"
                stackId="runs"
                fill="var(--chart-failed)"
                isAnimationActive={false}
              />
              <Bar
                dataKey="cancelled"
                name="Canceladas"
                stackId="runs"
                fill="var(--chart-cancelled)"
                isAnimationActive={false}
              />
              <Bar
                dataKey="interrupted"
                name="Interrumpidas"
                stackId="runs"
                fill="var(--chart-interrupted)"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure className="m-0">
        <figcaption className="mb-2 text-small font-extrabold text-ink">
          Costo por día (US$)
        </figcaption>
        <div aria-hidden="true" className="h-64 w-full" data-testid="chart-cost">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              accessibilityLayer={false}
              margin={{ top: 8, right: 8, left: -4, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={axis}
                tickLine={false}
                axisLine={{ stroke: "var(--line-strong)" }}
              />
              <YAxis
                tick={axis}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <Tooltip
                {...tooltip}
                formatter={(value) =>
                  typeof value === "number" ? `US$ ${value.toFixed(4)}` : String(value)
                }
              />
              <Legend wrapperStyle={legendStyle} formatter={legendLabel} />
              <Bar
                dataKey="confirmed"
                name="Confirmado"
                stackId="cost"
                fill="var(--chart-confirmed)"
                isAnimationActive={false}
              />
              <Bar
                dataKey="estimated"
                name="Estimado"
                stackId="cost"
                fill="var(--chart-estimated)"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
