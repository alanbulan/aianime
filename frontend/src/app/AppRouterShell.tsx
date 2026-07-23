// Copyright (c) 2026 AI anime
import { RouterProvider } from "@tanstack/react-router";

import { AppUpdateAvailable } from "@/components/app-update-available";
import { AppUpdateRequired } from "@/components/app-update-required";
import { useChunkLoadRecoveryRequired } from "@/lib/chunk-load-recovery";
import { router } from "@/app/router";

export function AppRouterShell() {
  const updateRequired = useChunkLoadRecoveryRequired();

  return (
    <>
      <RouterProvider router={router} />
      {updateRequired ? <AppUpdateRequired /> : <AppUpdateAvailable />}
    </>
  );
}
