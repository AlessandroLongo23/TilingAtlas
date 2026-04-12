import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query/provider";

export const metadata: Metadata = {
  title: "Tiling Atlas",
  description: "Explore uniform tilings of the plane",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
