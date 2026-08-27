// Copyright (c) 2026 AI anime
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";

import { AppErrorBoundary } from "@/app/AppErrorBoundary";
import { AppRouterShell } from "@/app/AppRouterShell";
import { queryClient } from "@/app/query-client";
import { ThemeProvider } from "@/components/theme-provider";
import { AppTitleTooltip } from "@/components/ui/app-title-tooltip";

export function AppRoot() {
  return (
    <StrictMode>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppRouterShell />
            <AppTitleTooltip />
          </ThemeProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </StrictMode>
  );
}
