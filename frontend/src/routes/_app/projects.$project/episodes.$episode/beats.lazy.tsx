// Copyright (c) 2026 AI anime
import { createLazyFileRoute } from "@tanstack/react-router";

import { useBeatsWorkbenchParam } from "@/modules/narrative_planning/public";
import { BeatsPageContent } from "@/app/workspace-composition";

function BeatsRouteAdapter() {
  const { project, episode } = Route.useParams();
  const {
    beat: deepLinkBeat,
    sub: targetSection,
    focusBeat,
    setBeat,
    clearFocusBeat,
  } = useBeatsWorkbenchParam();

  return (
    <BeatsPageContent
      clearFocusBeat={clearFocusBeat}
      deepLinkBeat={deepLinkBeat}
      episodeNumber={Number.parseInt(episode, 10)}
      focusBeat={focusBeat}
      project={project}
      setBeat={setBeat}
      targetSection={targetSection}
    />
  );
}

export const Route = createLazyFileRoute(
  "/_app/projects/$project/episodes/$episode/beats",
)({
  component: BeatsRouteAdapter,
});
