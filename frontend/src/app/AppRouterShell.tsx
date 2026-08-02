// Copyright (c) 2026 AI anime
import { RouterProvider } from "@tanstack/react-router";

import { router } from "@/app/router";
import {
  useCommercialAuthStore,
  useCommercialEntitlementStore,
} from "@/modules/identity_access/public";
import {
  AppUpdateAvailable,
  AppUpdateRequired,
  CommercialUpdateRequired,
  useChunkLoadRecoveryRequired,
} from "@/modules/platform_release/public";

export function AppRouterShell() {
  const updateRequired = useChunkLoadRecoveryRequired();
  const commercialSession = useCommercialAuthStore((state) => state.session);
  const entitlementReady = useCommercialEntitlementStore(
    (state) => state.status === "ready",
  );
  const commercialReleaseEnabled = Boolean(
    window.aiAnimeDesktop?.commercial && commercialSession && entitlementReady,
  );

  return (
    <>
      <RouterProvider router={router} />
      {updateRequired ? <AppUpdateRequired /> : <AppUpdateAvailable />}
      <CommercialUpdateRequired enabled={commercialReleaseEnabled} />
    </>
  );
}
