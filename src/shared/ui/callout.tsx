import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Inline status message. Announcements are the caller's choice (`role="status"` / `alert`). */
export const calloutVariants = cva(
  "flex items-start gap-3 rounded-md border px-4 py-3 text-small [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        info: "border-line bg-surface-sunken text-copy [&>svg]:text-icon",
        notice: "border-transparent bg-notice text-on-notice",
        danger: "border-transparent bg-danger-surface text-ink [&>svg]:text-danger",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

export function Callout({
  className,
  tone,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof calloutVariants>) {
  return (
    <div data-slot="callout" className={cn(calloutVariants({ tone }), className)} {...props} />
  );
}
