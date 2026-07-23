// Copyright (c) 2026 AI anime
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";

import { AppRouterShell } from "@/app/AppRouterShell";
import { queryClient } from "@/app/query-client";
import { ThemeProvider } from "@/components/theme-provider";

export function AppRoot() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppRouterShell />
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}
