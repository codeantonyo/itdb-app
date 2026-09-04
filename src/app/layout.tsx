import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { themeInitScript } from "@/lib/client/theme";
import "./globals.css";

// MERIDIAN faces: Playfair for the institution's voice (headings,
// figures of record), Inter for UI and tabular numbers.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ITDB — International Tokenized Development Bank",
  description:
    "A consumer bank on Stellar. ITDB, ITDBONE and QRS — live prices, tiered reserve positions, and one card per account.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ITDB",
  },
};

export const viewport: Viewport = {
  themeColor: "#06162f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${playfair.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        {/* Apply persisted theme before first paint to avoid flashing */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Telegram Mini App bridge — harmless no-op in normal browsers */}
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
