"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/ui/cn";

const LINKS = [
  { href: "/panel", label: "Estado", owner: false },
  { href: "/panel/accesos", label: "Accesos", owner: true },
  { href: "/panel/cuenta", label: "Cuenta", owner: false },
] as const;

export function PanelNav({ owner }: { owner: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Backoffice">
      <ul className="flex flex-wrap gap-1">
        {LINKS.filter((link) => owner || !link.owner).map((link) => {
          const current = path === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-pill px-3 text-small font-extrabold no-underline",
                  current ? "bg-chip text-on-chip" : "text-copy hover:bg-ink/5",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
