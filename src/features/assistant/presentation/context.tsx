"use client";
import { createContext, type ReactNode, useContext } from "react";
import { type Copy, copy, type Locale } from "@/shared/i18n/copy";
import type { LinkPolicy } from "../domain/links";

export type PresentationMode = "embed" | "standalone";

type Presentation = {
  t: Copy;
  locale: Locale;
  policy: LinkPolicy;
  mode: PresentationMode;
  /** Storefront support page (validated), offered when the assistant is unavailable. */
  supportUrl: string | null;
  /** False while the host keeps the embedded panel minimized: no announcements, no motion. */
  visible: boolean;
};

const PresentationContext = createContext<Presentation | null>(null);

export function PresentationProvider({
  value,
  children,
}: {
  value: Presentation;
  children: ReactNode;
}) {
  return <PresentationContext value={value}>{children}</PresentationContext>;
}

export function usePresentation(): Presentation {
  const value = useContext(PresentationContext);
  if (!value) throw new Error("usePresentation must be used inside PresentationProvider");
  return value;
}

export function copyFor(locale: Locale): Copy {
  return copy[locale];
}
