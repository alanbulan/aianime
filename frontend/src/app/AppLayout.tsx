import { Outlet } from "@tanstack/react-router";

import { AppLayoutView } from "@/app/AppLayoutView";
import { useAppLayoutController } from "@/app/use-app-layout-controller";

export function AppLayout() {
  const controller = useAppLayoutController();
  return <AppLayoutView controller={controller} outlet={<Outlet />} />;
}
