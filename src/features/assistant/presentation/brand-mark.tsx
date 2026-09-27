import { cn } from "@/shared/ui/cn";

/**
 * Pequeverso isotipo (approved raster, public/brand; all rights reserved — see
 * THIRD_PARTY_NOTICES.md). Decorative next to visible text, so the alt text is empty.
 */
export function BrandMark({
  size = 32,
  className,
}: {
  size?: 24 | 32 | 40 | 56;
  className?: string;
}) {
  const source =
    size > 40
      ? "/brand/brand-isotipo-w192-f34b1740.webp"
      : "/brand/brand-isotipo-w96-cf729aa6.webp";
  return (
    // biome-ignore lint/performance/noImgElement: a fixed-size local raster needs no optimizer (images.unoptimized parity with the storefront)
    <img
      src={source}
      alt=""
      width={size}
      height={size}
      decoding="async"
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full bg-white object-cover ring-1 ring-line", className)}
    />
  );
}
