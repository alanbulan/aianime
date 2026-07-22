// Copyright (c) 2026 AI anime
import { createFileRoute } from "@tanstack/react-router";

import { SuperChatPanel } from "@/features/superchat/superchat-panel";

function ProjectAssistantPage() {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <SuperChatPanel />
    </div>
  );
}

export const Route = createFileRoute("/_app/projects/$project/assistant")({
  component: ProjectAssistantPage,
});
