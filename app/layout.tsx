import type { Metadata } from "next";
import { ThemeInitializer } from "@/components/theme-initializer";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <Analytics />
        <ThemeInitializer />
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
