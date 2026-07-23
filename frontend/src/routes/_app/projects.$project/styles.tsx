// Copyright (c) 2026 AI anime
import { createFileRoute } from "@tanstack/react-router";

import { StylesPageContent } from "@/modules/asset_world/public";

function StylesRouteAdapter() {
  const { project } = Route.useParams();
  return <StylesPageContent project={project} />;
}

export const Route = createFileRoute("/_app/projects/$project/styles")({
  component: StylesRouteAdapter,
});
