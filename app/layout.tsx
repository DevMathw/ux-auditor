import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UX Auditor",
  description: "AI-powered UX analysis — visual hierarchy, accessibility, and clarity",
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
