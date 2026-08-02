// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";
import type { CanvasStoryScriptSubmissionGateway } from "../application/generateCanvasStoryScript";

export const freezoneStoryScriptGenerationGateway: CanvasStoryScriptSubmissionGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/text/story-script`,
      {
        method: "POST",
        json: {
          ...(command.canvasId ? { canvas_id: command.canvasId } : {}),
          ...(command.nodeId ? { node_id: command.nodeId } : {}),
          source_text: command.sourceText,
          model: command.model,
          ...(command.videoUrl != null
            ? { video_url: command.videoUrl }
            : {}),
          ...(command.durationSec != null
            ? { duration_sec: command.durationSec }
            : {}),
          ...(command.prompt != null ? { prompt: command.prompt } : {}),
          ...(command.characterRefs && command.characterRefs.length > 0
            ? {
                character_refs: command.characterRefs.map((reference) => ({
                  ...(reference.name != null
                    ? { name: reference.name }
                    : {}),
                  image_url: reference.imageUrl,
                })),
              }
            : {}),
        },
      },
    );
  },
};
