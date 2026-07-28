// Copyright (c) 2026 AI anime
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";

import { EpisodeComposePage } from "@/modules/production/public";

function EpisodeComposeRoute() {
  const { project, episode } = Route.useParams();
  const navigate = useNavigate();

  return (
    <EpisodeComposePage
      project={project}
      episode={Number.parseInt(episode, 10)}
      onOpenBeat={(beatNumber) => {
        void navigate({
          to: "/projects/$project/episodes/$episode/beats",
          params: { project, episode },
          search: ((previous: Record<string, unknown>) => ({
            ...previous,
            focusBeat: beatNumber,
          })) as never,
        });
      }}
    />
  );
}

export const Route = createLazyFileRoute(
  "/_app/projects/$project/episodes/$episode/compose",
)({
  component: EpisodeComposeRoute,
});
