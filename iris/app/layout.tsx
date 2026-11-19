import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Aether-os",
  description: "Build, run and support AI agents",
};

/**
 * Sets the stored theme (light, dark or the system's) on <html> before the
 * first paint, so a dark page never flashes light. `ThemeSwitch` changes it.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("iris-theme");document.documentElement.className=t==="light"||t==="dark"?t:"system"}catch(e){}`;

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
