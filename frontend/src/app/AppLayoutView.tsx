import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { Header } from "@/components/layout/header";
import { TaskPanel } from "@/components/task-center/panel";
import { TaskStatusBar } from "@/components/task-center/status-bar";
import type { AppLayoutController } from "@/app/use-app-layout-controller";
import { VersionUpdateDialog } from "@/modules/platform_release/public";
import { TaskCenterProvider } from "@/task-center/provider";

export function AppLayoutView({
  controller,
  outlet,
}: {
  controller: AppLayoutController;
  outlet: ReactNode;
}) {
  if (controller.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <TaskCenterProvider projectId={controller.canonicalProject}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <Header />
            <VersionUpdateDialog />
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <main
                id="main-content"
                tabIndex={-1}
                className={
                  controller.isAssistantPage
                    ? "min-w-0 flex-1 overflow-y-auto px-6 pb-0 pt-6 focus:outline-none [scrollbar-gutter:stable]"
                    : "min-w-0 flex-1 overflow-y-auto p-6 focus:outline-none [scrollbar-gutter:stable]"
                }
              >
                <motion.div
                  key={controller.routeTransitionKey}
                  className="h-full min-w-0"
                  initial={false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: controller.reducedMotion ? 0 : 0.28,
                    ease: "easeOut",
                  }}
                >
                  {outlet}
                </motion.div>
              </main>
            </div>
            <TaskPanel />
            <TaskStatusBar />
          </div>
        </div>
      </div>
    </TaskCenterProvider>
  );
}
