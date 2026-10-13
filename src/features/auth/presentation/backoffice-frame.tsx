import type { ReactNode } from "react";
import { BrandMark } from "@/shared/ui/brand-mark";

/**
 * Page frame of the private backoffice. Narrow screens: brand and account on the first row,
 * navigation on its own row. Wider screens share a row when space permits; enlarged text may wrap.
 */
export function BackofficeFrame({
  nav,
  account,
  children,
}: {
  nav?: ReactNode;
  account?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <span className="flex min-h-12 min-w-0 max-w-full flex-wrap items-center gap-2.5 gap-y-1 [overflow-wrap:anywhere]">
            <BrandMark size={40} />
            <span className="font-display text-xl font-bold text-ink">Pequeverso</span>
            <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-tiny font-extrabold text-copy">
              Backoffice
            </span>
          </span>
          {account ? (
            <div className="ms-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 md:order-3">
              {account}
            </div>
          ) : null}
          {nav ? <div className="w-full md:order-2 md:ms-4 md:w-auto md:flex-1">{nav}</div> : null}
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
