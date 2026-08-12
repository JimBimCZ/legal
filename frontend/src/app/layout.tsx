import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Libre_Caslon_Display, Libre_Caslon_Text } from "next/font/google";
import "./globals.css";

const displaySerif = Libre_Caslon_Display({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const documentSerif = Libre_Caslon_Text({
  variable: "--font-document",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const uiSans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const uiMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
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
      className={`${displaySerif.variable} ${documentSerif.variable} ${uiSans.variable} ${uiMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
