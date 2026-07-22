// Copyright (c) 2026 AI anime
import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return children;
}

export function useResolvedTheme(): "light" | "dark" {
  return useAppStore((s) => s.theme);
}
