// Copyright (c) 2026 AI anime
import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

// v3 redirect — see sketches.lazy.tsx for rationale.
function AudioRedirect() {
  const { project, episode } = Route.useParams();
  return (
    <Navigate
      to="/projects/$project/episodes/$episode/beats"
      params={{ project, episode }}
      search={{ sub: "audio" } as never}
      replace
    />
  );
}

export const Route = createLazyFileRoute(
  "/_app/projects/$project/episodes/$episode/audio",
)({
  component: AudioRedirect,
});
