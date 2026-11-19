import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { SIDEBAR_WIDTH_SCRIPT } from "@/components/sidebar-width";

import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "x-corpus",
  description: "Every post you bookmarked or liked on X, sorted into topics.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} h-full antialiased`}
      // The script below sets the remembered sidebar width on this element before React hydrates it.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_WIDTH_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
