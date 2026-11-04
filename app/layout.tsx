import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Tracker } from "@/components/analytics/tracker";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Netzlage Deutschland", template: "%s · Netzlage" },
  description: "Aktuelle Lage und Historie des deutschen Stromnetzes: Erzeugung, Verbrauch, Grenzflüsse, Preise.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script changes the class on <html> before hydration.
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#inhalt"
          className="sr-only z-50 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-slate-900 shadow-md focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
        >
          Zum Inhalt springen
        </a>
        <SiteHeader />
        <div id="inhalt" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </div>
        <SiteFooter />
        <Tracker />
      </body>
    </html>
  );
}
