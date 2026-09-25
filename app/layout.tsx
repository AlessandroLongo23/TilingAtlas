import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { LayerHistory } from "@/lib/hooks/useModalLayer";
import "./globals.css";
import "katex/dist/katex.min.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Tiling Atlas",
  description:
    "A catalogue of tilings of the plane, the sphere, and the hyperbolic plane.",
};

// viewport-fit=cover lets the phone layout reach under the notch and the home indicator; the top bar,
// sheets and floating chrome pad themselves with env(safe-area-inset-*). Desktop browsers ignore it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`;
  return (
    <html
      lang="en"
      className={`h-full antialiased ${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      {/* Side insets: a phone turned to landscape is wider than 768px and gets the desktop layout, which
          would otherwise run under the notch. env() is 0 everywhere else, so nothing else moves. */}
      <body className="min-h-full flex flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        {children}
        {/* Loads the phone sheets' Back handling on every route, ahead of the router (useModalLayer). */}
        <LayerHistory />
        <Analytics />
      </body>
    </html>
  );
}
