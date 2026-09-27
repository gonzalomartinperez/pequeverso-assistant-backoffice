import type { ComponentProps, ReactNode } from "react";
import { Button, type ButtonVariants } from "./button";
import { cn } from "./cn";

/**
 * Icon-only button with an accessible name and a visible tooltip on hover and keyboard focus
 * (never hover-only information: the same text is the accessible name).
 */
export function IconButton({
  label,
  children,
  className,
  variant = "ghost",
  size = "icon",
  tooltipSide = "bottom",
  ...props
}: Omit<ComponentProps<"button">, "aria-label" | "children"> &
  ButtonVariants & { label: string; children: ReactNode; tooltipSide?: "top" | "bottom" }) {
  return (
    <span className="group/tip relative inline-flex">
      <Button aria-label={label} variant={variant} size={size} className={className} {...props}>
        {children}
      </Button>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-0 z-30 whitespace-nowrap rounded-chip bg-ink px-2 py-1 text-tiny font-bold text-surface opacity-0 shadow-md transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100",
          tooltipSide === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}
