import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sophia Members",
  description: "Simple non-sensitive member directory",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
