import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Raised surface for product and resource content. Composition: Card > (media) + CardBody. */
export function Card({ className, ...props }: ComponentProps<"article">) {
  return (
    <article
      data-slot="card"
      className={cn(
        "overflow-hidden rounded-lg border border-line bg-surface-raised text-copy shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="card-body" className={cn("flex flex-col gap-2 p-4", className)} {...props} />
  );
}
