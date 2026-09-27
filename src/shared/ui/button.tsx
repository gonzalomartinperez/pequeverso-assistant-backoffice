import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Owned adaptation of the shadcn/ui button (MIT) to Pequeverso roles. Every target is ≥ 44 px
 * (`sm` included; `icon-sm` is 40 px and only used inside the 56 px header row with 44 px hit
 * padding). `purchase` (coral) is reserved for the purchase action, as on the storefront.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 border font-sans font-extrabold leading-tight no-underline select-none transition-[background-color,border-color,color,box-shadow,translate] duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        action: "rounded-pill border-transparent bg-action text-on-action hover:bg-action-hover",
        purchase:
          "rounded-pill border-transparent bg-purchase text-on-purchase shadow-purchase hover:bg-purchase-hover motion-safe:hover:-translate-y-px",
        outline:
          "rounded-pill border-line-strong bg-transparent text-ink hover:border-ink hover:bg-ink/5",
        ghost: "rounded-pill border-transparent bg-transparent text-ink hover:bg-ink/8",
        chip: "rounded-pill border-transparent bg-chip text-on-chip font-bold hover:bg-chip-hover text-left",
        link: "min-h-0 rounded-sm border-transparent px-0 font-bold text-link underline underline-offset-4 hover:text-link-hover",
      },
      size: {
        sm: "min-h-11 px-4 text-small",
        md: "min-h-12 px-5 text-body",
        icon: "size-11 rounded-full p-0",
        "icon-sm": "size-10 rounded-full p-0 [&_svg:not([class*='size-'])]:size-[18px]",
        none: "",
      },
    },
    defaultVariants: { variant: "action", size: "md" },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonVariants) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

/** Anchor styled as a button (navigation stays a link for assistive technology). */
export function LinkButton({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"a"> & ButtonVariants) {
  return (
    <a
      data-slot="link-button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
