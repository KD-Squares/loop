import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
