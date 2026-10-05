import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backoffice · Asistente Pequeverso",
  description: "Operaciones privadas del asistente de Pequeverso.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffaf2",
};

/**
 * Applies the theme before first paint: the system preference (the backoffice has no stored
 * theme setting). Runs with the per-request CSP nonce.
 */
const themeScript = `(()=>{try{document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){}})()`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Backoffice routes carry a per-request CSP nonce (src/proxy.ts); other routes have none.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  preload("/fonts/nunito-sans-latin-wght-29e38904.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "",
  });
  preload("/fonts/fraunces-latin-wght-7f9d191d.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "",
  });
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static pre-paint theme script, no user input */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
