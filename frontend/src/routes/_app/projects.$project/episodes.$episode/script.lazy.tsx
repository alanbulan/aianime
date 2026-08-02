// Copyright (c) 2026 AI anime
import { createLazyFileRoute } from "@tanstack/react-router";

import { ScriptPageContent } from "@/app/workspace-composition";

function ScriptRouteAdapter() {
  const { project, episode } = Route.useParams();
  return (
    <ScriptPageContent
      project={project}
      episodeNumber={Number.parseInt(episode, 10)}
    />
  );
}

export const Route = createLazyFileRoute(
  "/_app/projects/$project/episodes/$episode/script",
)({
  component: ScriptRouteAdapter,
});
