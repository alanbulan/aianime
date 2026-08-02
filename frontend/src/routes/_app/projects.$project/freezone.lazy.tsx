// Copyright (c) 2026 AI anime
import { createLazyFileRoute } from "@tanstack/react-router";

import { FreezoneProjectPage } from "@/app/creative-canvas-composition";

function FreezoneProjectRoute() {
  const { project } = Route.useParams();
  return <FreezoneProjectPage projectId={project} />;
}

export const Route = createLazyFileRoute("/_app/projects/$project/freezone")({
  component: FreezoneProjectRoute,
});
