import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-tiny font-extrabold [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        chip: "bg-chip text-on-chip",
        quiet: "bg-surface-sunken text-copy",
        notice: "bg-notice text-on-notice",
      },
    },
    defaultVariants: { tone: "chip" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}
