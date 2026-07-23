// Copyright (c) 2026 AI anime
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";

import { TOP_TABS } from "@/lib/episode-nav";
import { EpisodesPageContent } from "@/modules/narrative_planning/public";

const DEFAULT_STAGE_PATH = "/script";
const KNOWN_STAGE_PATHS: readonly string[] = [
  ...TOP_TABS.map((tab) => tab.routeSegment),
  "/sketches",
  "/audio",
  "/video",
  "/overview",
];

function selectedEpisodeNumber(): number | null {
  const params = useParams({ strict: false }) as { episode?: string };
  return params.episode ? Number(params.episode) : null;
}

function activeStagePath(pathname: string): string {
  const match = pathname.match(/\/episodes\/\d+(\/[a-z-]+)?/);
  const path = match?.[1] ?? "";
  return KNOWN_STAGE_PATHS.includes(path) ? path : DEFAULT_STAGE_PATH;
}

function EpisodesRouteAdapter() {
  const { project } = Route.useParams();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const stagePath = activeStagePath(pathname);

  return (
    <EpisodesPageContent
      project={project}
      selectedEpisodeNumber={selectedEpisodeNumber()}
      onBackToEpisodes={() =>
        navigate({ to: `/projects/${project}/episodes` })
      }
      onSelectEpisode={(episodeNumber) =>
        navigate({
          to: `/projects/${project}/episodes/${episodeNumber}${stagePath}`,
        })
      }
      episodeContent={<Outlet />}
    />
  );
}

export const Route = createFileRoute("/_app/projects/$project/episodes")({
  component: EpisodesRouteAdapter,
});
