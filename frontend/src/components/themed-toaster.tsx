// Copyright (c) 2026 AI anime
import type { CSSProperties } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Toaster } from "sonner";

import { projectSectionFromPath } from "@/components/layout/project-navigation-routes";
import { useAppStore } from "@/stores/app-store";

const APP_HEADER_HEIGHT = 48;
const WORKSPACE_SUBNAV_ROW_HEIGHT = 42;
const TOAST_SAFE_GAP = 12;

export function ThemedToaster() {
  const theme = useAppStore((state) => state.theme);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projectSection = projectSectionFromPath(pathname);
  const isAppRoute = pathname === "/" || pathname.startsWith("/projects/");
  const hasWorkspaceSubnav = projectSection !== null && projectSection !== "freezone";
  const topOffset = isAppRoute
    ? APP_HEADER_HEIGHT + (hasWorkspaceSubnav ? WORKSPACE_SUBNAV_ROW_HEIGHT : 0) + TOAST_SAFE_GAP
    : 24;

  return (
    <Toaster
      position="top-center"
      theme={theme}
      closeButton={false}
      duration={2200}
      visibleToasts={1}
      offset={topOffset}
      toastOptions={{
        style: {
          "--width": "auto",
          minWidth: 0,
        } as CSSProperties,
        className:
          "!min-h-0 !rounded-sm !border !border-border !bg-popover !px-4 !py-2 !text-sm !text-popover-foreground !shadow-lg",
      }}
    />
  );
}
