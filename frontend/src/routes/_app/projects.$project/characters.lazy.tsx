// Copyright (c) 2026 AI anime
import { createLazyFileRoute } from "@tanstack/react-router";

import { CharactersPageContent } from "@/modules/asset_world/public";

function CharactersRouteAdapter() {
  const { project } = Route.useParams();
  return <CharactersPageContent project={project} />;
}

export const Route = createLazyFileRoute("/_app/projects/$project/characters")({
  component: CharactersRouteAdapter,
});
