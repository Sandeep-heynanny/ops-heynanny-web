import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

const manrope = localFont({
  src: "./fonts/Manrope-latin-var.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});

const dmSerif = localFont({
  src: [
    { path: "./fonts/DMSerifDisplay-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/DMSerifDisplay-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-dm-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HeyNanny Ops",
  description: "Internal dashboard for the HeyNanny operations team.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f0e7d5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${manrope.variable} ${dmSerif.variable} antialiased`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
