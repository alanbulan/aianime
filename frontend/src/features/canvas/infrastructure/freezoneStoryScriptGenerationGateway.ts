// Copyright (c) 2026 AI anime
import { submitFreezoneStoryScript } from "@/api/ops";

import type { CanvasStoryScriptSubmissionGateway } from "../application/generateCanvasStoryScript";

export const freezoneStoryScriptGenerationGateway: CanvasStoryScriptSubmissionGateway = {
  async submit(projectId, command) {
    return await submitFreezoneStoryScript(projectId, {
      sourceText: command.sourceText,
      videoUrl: command.videoUrl,
      durationSec: command.durationSec,
      characterRefs: command.characterRefs?.map((reference) => ({
        imageUrl: reference.imageUrl,
        name: reference.name,
      })),
      prompt: command.prompt,
      canvasId: command.canvasId,
      nodeId: command.nodeId,
    });
  },
};
