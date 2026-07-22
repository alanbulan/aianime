// Copyright (c) 2026 AI anime
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAppStore, type Theme } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const THEME_ORDER: Theme[] = ["system", "light", "dark"];
const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const Icon = THEME_ICONS[theme];
  const currentLabel = t(`theme.${theme}`);
  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("text-muted-foreground hover:text-foreground", className)}
      aria-label={`${t("theme.toggle")}: ${currentLabel}`}
      title={`${t("theme.toggle")}: ${currentLabel}`}
      onClick={() => setTheme(nextTheme)}
    >
      <Icon className="size-4" />
    </Button>
  );
}
