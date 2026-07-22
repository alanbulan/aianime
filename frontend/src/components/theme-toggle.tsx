// Copyright (c) 2026 AI anime
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore, type Theme } from "@/stores/app-store";
import { useResolvedTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: Theme; i18nKey: string; Icon: typeof Sun }> = [
  { value: "light", i18nKey: "theme.light", Icon: Sun },
  { value: "dark", i18nKey: "theme.dark", Icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const resolved = useResolvedTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("text-muted-foreground hover:text-foreground", className)}
            aria-label={t("theme.toggle")}
            title={t("theme.toggle")}
          />
        }
      >
        {resolved === "dark" ? (
          <Moon className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, i18nKey, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            data-active={theme === value}
            className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
          >
            <Icon className="size-4" />
            {t(i18nKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
