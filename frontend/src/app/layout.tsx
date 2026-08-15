import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

// One family sets the whole product - interface and agreement alike - split
// into registers by size and leading in globals.css rather than by typeface.
// Public Sans is the US Web Design System's face, drawn for setting official
// documents legibly at every size, which is this product's job exactly.
const uiSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

// The "record" voice: docket codes, clause numbers, field counts, and the
// labels that behave like references rather than prose.
const uiMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
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
      className={`${uiSans.variable} ${uiMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
