import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/** Dashboard section: a labelled region with a heading and optional description. */
export function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "rounded-lg border border-line bg-surface-raised p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <h2 id={`${id}-title`} className="text-title">
        {title}
      </h2>
      {description ? <p className="mt-1 text-small text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Term/value pairs. Values that are not available stay visibly marked as such. */
export function Facts({ items }: { items: { term: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="text-tiny font-extrabold uppercase tracking-[0.06em] text-muted">
            {item.term}
          </dt>
          <dd className="mt-0.5 text-body text-ink [overflow-wrap:anywhere]">{item.value}</dd>
          {item.hint ? <dd className="text-tiny text-muted">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Horizontal scroll region for wide tables, reachable by keyboard. */
export function TableRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a horizontally scrollable region must be keyboard-scrollable (WCAG 2.1.1, axe scrollable-region-focusable)
      tabIndex={0}
      className="overflow-x-auto rounded-md border border-line"
    >
      {children}
    </section>
  );
}

export const th =
  "bg-surface-sunken px-3 py-2 text-left text-tiny font-extrabold uppercase tracking-[0.06em] text-copy";
export const td = "border-t border-line px-3 py-2 text-small text-ink tabular-nums";
