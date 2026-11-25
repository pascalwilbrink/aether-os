import type { Metadata } from "next";

import { themeScript } from "@aether-os/design";

import { THEME_KEY } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas · Aether-os",
};

/**
 * Sets the stored theme (light, dark or the system's) on <html> before the
 * first paint, so a dark page never flashes light. `ThemeSwitch` changes it.
 */
const THEME_SCRIPT = themeScript(THEME_KEY);

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
