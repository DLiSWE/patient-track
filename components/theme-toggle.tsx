"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Theme = "dark" | "light";

function getStoredTheme(): Theme {
  const savedTheme = window.localStorage.getItem("theme");

  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [hasLoadedTheme, setHasLoadedTheme] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setHasLoadedTheme(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedTheme) {
      return;
    }

    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("theme", theme);
  }, [hasLoadedTheme, theme]);

  const isDark = theme === "dark";
  const label = hasLoadedTheme ? (isDark ? "Light" : "Dark") : "Theme";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      suppressHydrationWarning
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {!hasLoadedTheme ? (
        <MoonIcon data-icon="inline-start" />
      ) : isDark ? (
        <SunIcon data-icon="inline-start" />
      ) : (
        <MoonIcon data-icon="inline-start" />
      )}
      {label}
    </Button>
  );
}
