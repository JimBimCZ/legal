import type { Metadata } from "next";
import { Fraunces, Jost, Space_Mono } from "next/font/google";
import "./globals.css";

// One variable serif covers both the chrome and the document body - the
// SOFT/WONK/opsz axes are driven from `.type-display` / `.type-doc` in
// globals.css, so the two never need separate families. WONK stays loaded even
// though the display register now runs it at 0: the axis has to be requested
// at build time for the variation-settings declaration to resolve at all.
const displaySerif = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const uiSans = Jost({
  variable: "--font-sans",
  subsets: ["latin"],
});

const uiMono = Space_Mono({
  variable: "--font-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Legal Document Creator",
  description: "Chat with an AI assistant to choose and fill in a legal document.",
};

// Runs before hydration so the page never flashes the wrong theme: resolves the
// user's saved preference, falling back to their OS setting if they haven't
// chosen one yet.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");document.documentElement.classList.toggle("dark",t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches));}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${displaySerif.variable} ${uiSans.variable} ${uiMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
