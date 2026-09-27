import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * shadcn/ui's class combiner, taught this design system's custom font sizes. Without this,
 * tailwind-merge reads `text-small` as a colour and silently drops `text-on-purchase`.
 * Keep in sync with the `--text-*` tokens in src/app/globals.css.
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["tiny", "small", "body", "title", "heading", "display", "price"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
