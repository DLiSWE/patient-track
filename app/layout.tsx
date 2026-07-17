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
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const savedTheme = window.localStorage.getItem("theme");
                  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
                    document.documentElement.classList.add("dark");
                  }
                } catch {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
