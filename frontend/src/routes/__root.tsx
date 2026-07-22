// Copyright (c) 2026 AI anime
import { createRootRoute, Outlet, useRouterState, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ThemedToaster } from "@/components/themed-toaster";
import { DesktopTitleBar } from "@/components/layout/desktop-title-bar";
import { AppUpdateRequired } from "@/components/app-update-required";
import { isChunkLoadError } from "@/lib/chunk-load-recovery";

/**
 * Moves keyboard focus to the main landmark on each navigation, so
 * screen-reader and keyboard users don't lose orientation after a route
 * change. The `<main id="main-content" tabIndex={-1}>` lives in _app.tsx.
 * Skipped on first mount — initial focus stays wherever the browser placed
 * it (usually the URL bar).
 */
function RouteFocusManager() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const main = document.getElementById("main-content");
    main?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function RootLayout() {
  return (
    <div
      className={`flex h-dvh flex-col overflow-hidden bg-background ${
        window.aiAnimeDesktop
          ? "[--desktop-title-bar-height:36px]"
          : "[--desktop-title-bar-height:0px]"
      }`}
    >
      <DesktopTitleBar />
      <RouteFocusManager />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
      <ThemedToaster />
    </div>
  );
}

function RootErrorComponent({ error }: ErrorComponentProps) {
  const { t } = useTranslation();
  if (isChunkLoadError(error)) {
    return <AppUpdateRequired />;
  }

  return (
    <div className="flex h-full items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
        <h1 className="text-lg font-semibold">{t("app.routeError.title")}</h1>
        <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">
          {error instanceof Error ? error.message : t("app.routeError.description")}
        </p>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorComponent,
});
