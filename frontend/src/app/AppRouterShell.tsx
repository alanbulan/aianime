// Copyright (c) 2026 AI anime
import { RouterProvider } from "@tanstack/react-router";

import { router } from "@/app/router";
import {
  AppUpdateAvailable,
  AppUpdateRequired,
  useChunkLoadRecoveryRequired,
} from "@/modules/platform_release/public";

export function AppRouterShell() {
  const updateRequired = useChunkLoadRecoveryRequired();

  return (
    <>
      <RouterProvider router={router} />
      {updateRequired ? <AppUpdateRequired /> : <AppUpdateAvailable />}
    </>
  );
}
