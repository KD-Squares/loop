import type { Metadata } from "next";
import { Fredoka, DM_Sans } from "next/font/google";
import "./globals.css";

// Display font (headings, brand) + body font, matching the Loop design doc.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dmsans",
});

export const metadata: Metadata = {
  title: "Loop — live quiz games",
  description: "Build a quiz once, play it live any time. Up to 100 players.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fredoka.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
