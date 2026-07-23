// Copyright (c) 2026 AI anime
import { createFileRoute } from "@tanstack/react-router";

import { ProjectDashboardPage } from "@/modules/project_workspace/public";

export const Route = createFileRoute("/_app/")({
  component: ProjectDashboardPage,
});
