"use client";

import { useEffect } from "react";

export function ThemeInitializer() {
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const shouldUseDarkTheme = savedTheme === "dark" || (!savedTheme && prefersDark);

      document.documentElement.classList.toggle("dark", shouldUseDarkTheme);
    } catch {
      // If localStorage is unavailable, keep the server-rendered theme.
    }
  }, []);

  return null;
}
