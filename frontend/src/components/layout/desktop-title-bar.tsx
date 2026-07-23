import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BRAND_NAME, BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export const DESKTOP_TITLE_BAR_HEIGHT = 36;

export function DesktopTitleBar() {
  const { t } = useTranslation();
  const bridge = window.aiAnimeDesktop;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--desktop-title-bar-height",
      bridge ? `${DESKTOP_TITLE_BAR_HEIGHT}px` : "0px",
    );
    return () => {
      root.style.removeProperty("--desktop-title-bar-height");
    };
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    let mounted = true;
    void bridge.windowControls.isMaximized().then((value) => {
      if (mounted) setMaximized(value);
    });
    const unsubscribe = bridge.windowControls.onMaximizedChange(setMaximized);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [bridge]);

  if (!bridge) return null;

  return (
    <div
      className="desktop-title-bar-drag relative z-[100] flex h-9 shrink-0 select-none items-center border-b border-border bg-background text-foreground"
      onDoubleClick={() => bridge.windowControls.toggleMaximize()}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <BrandMark className="h-5 w-8" />
        <span className="truncate whitespace-nowrap text-xs font-medium">{BRAND_NAME}</span>
      </div>
      <div
        id="desktop-title-bar-actions"
        className="desktop-title-bar-controls flex h-full shrink-0 items-center gap-1 px-1"
      />
      <div
        className="desktop-title-bar-controls flex h-full"
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <ThemeToggle className="h-full w-11 rounded-none" />
        <TitleBarButton
          label={t("desktopWindow.minimize")}
          onClick={() => bridge.windowControls.minimize()}
        >
          <Minus className="size-4" />
        </TitleBarButton>
        <TitleBarButton
          label={maximized ? t("desktopWindow.restore") : t("desktopWindow.maximize")}
          onClick={() => bridge.windowControls.toggleMaximize()}
        >
          {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
        </TitleBarButton>
        <TitleBarButton
          label={t("desktopWindow.close")}
          danger
          onClick={() => bridge.windowControls.close()}
        >
          <X className="size-4" />
        </TitleBarButton>
      </div>
    </div>
  );
}

function TitleBarButton({
  children,
  danger = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex h-full w-11 items-center justify-center transition-colors ${
        danger
          ? "hover:bg-destructive hover:text-destructive-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
