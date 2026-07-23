// Copyright (c) 2026 AI anime
import { createFileRoute } from "@tanstack/react-router";

import { IngestPageContent } from "@/modules/story_intake/public";

function IngestRoutePage() {
  const { project } = Route.useParams();
  return <IngestPageContent project={project} />;
}

export { IngestPageContent } from "@/modules/story_intake/public";

export const Route = createFileRoute("/_app/projects/$project/ingest")({
  component: IngestRoutePage,
});
