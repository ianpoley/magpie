import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { DebugFlagsProvider } from "@/components/debug-flags/provider";
import { SIDEBAR_LIMITS_CSS, SIDEBAR_WIDTH_SCRIPT } from "@/components/sidebar-width";

import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Magpie",
  description: "Every post you bookmarked or liked on X, sorted into topics.",
  referrer: "no-referrer",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${bricolage.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: SIDEBAR_LIMITS_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_WIDTH_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <DebugFlagsProvider>{children}</DebugFlagsProvider>
      </body>
    </html>
  );
}
