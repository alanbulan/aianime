// Copyright (c) 2026 AI anime
import { createContext, useContext, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";

type ResolvedTheme = "light" | "dark";

const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const ResolvedThemeContext = createContext<ResolvedTheme>("light");

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    typeof window !== "undefined" && window.matchMedia?.(SYSTEM_THEME_QUERY).matches
      ? "dark"
      : "light",
  );
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const media = window.matchMedia?.(SYSTEM_THEME_QUERY);
    if (!media) return;

    const syncSystemTheme = (matches: boolean) => {
      setSystemTheme(matches ? "dark" : "light");
    };
    const handleChange = (event: MediaQueryListEvent) => syncSystemTheme(event.matches);

    syncSystemTheme(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  return (
    <ResolvedThemeContext.Provider value={resolvedTheme}>
      {children}
    </ResolvedThemeContext.Provider>
  );
}

export function useResolvedTheme(): ResolvedTheme {
  return useContext(ResolvedThemeContext);
}
