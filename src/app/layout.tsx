import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistente Pequeverso",
  description: "Asistente informativo de la tienda Pequeverso.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The on-screen keyboard shrinks the layout viewport, so the composer stays visible (standalone).
  interactiveWidget: "resizes-content",
  themeColor: "#fffaf2",
};

/**
 * Applies the theme before first paint. Embed: the host's choice arrives as `?theme=` on the
 * iframe URL (then by protocol). Standalone: stored choice, else the system preference.
 * Storage may be blocked (third-party contexts, private modes); failures fall back silently.
 */
const themeScript = `(()=>{try{var d=document.documentElement,q=new URLSearchParams(location.search).get("theme");if(location.pathname==="/embed"){d.dataset.theme=q==="dark"?"dark":"light";return}var s=null;try{s=localStorage.getItem("pv-assistant-theme")}catch(e){}d.dataset.theme=s==="dark"||s==="light"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
