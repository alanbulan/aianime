// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from "../domain/canvasNodes";
import type { CanvasGenerationTaskGateway } from "./ports";
import {
  buildCanvasStoryScriptCommand,
  classifyCanvasStoryScriptReference,
  generateCanvasStoryScript,
  isCanvasStoryScriptResult,
  type CanvasStoryScriptSubmissionGateway,
} from "./generateCanvasStoryScript";

function canvasNode(
  id: string,
  type: string,
  data: Record<string, unknown>,
): CanvasNode {
  return { id, type, data, position: { x: 0, y: 0 } } as CanvasNode;
}

describe("Canvas story script generation", () => {
  it("classifies supported upstream Canvas nodes", () => {
    expect(
      classifyCanvasStoryScriptReference(
        canvasNode("text-1", CANVAS_NODE_TYPES.textAnnotation, {
          content: "Story context",
          displayName: "Context",
        }),
      ),
    ).toEqual({
      nodeId: "text-1",
      kind: "text",
      text: "Story context",
      displayName: "Context",
    });
    expect(
      classifyCanvasStoryScriptReference(
        canvasNode("video-1", CANVAS_NODE_TYPES.video, {
          videoUrl: "/video.mp4",
          previewImageUrl: "/poster.png",
          durationMs: 2_500,
        }),
      ),
    ).toEqual({
      nodeId: "video-1",
      kind: "video",
      thumbUrl: "/poster.png",
      videoUrl: "/video.mp4",
      durationSec: 2.5,
      displayName: null,
    });
    expect(
      classifyCanvasStoryScriptReference(
        canvasNode("script-1", CANVAS_NODE_TYPES.script, {}),
      ),
    ).toBeNull();
  });

  it("builds the source priority, steering prompt and media references", () => {
    expect(
      buildCanvasStoryScriptCommand({
        references: [
          { nodeId: "text-1", kind: "text", text: " First scene " },
          { nodeId: "text-2", kind: "text", text: "Second scene" },
          {
            nodeId: "video-1",
            kind: "video",
            videoUrl: "/video.mp4",
            durationSec: 8,
          },
          {
            nodeId: "image-1",
            kind: "image",
            thumbUrl: "/hero.png",
            displayName: " Hero ",
          },
        ],
        prompt: " Cinematic ",
        canvasId: "canvas-1",
        nodeId: "script-1",
      }),
    ).toEqual({
      sourceText: "First scene\n\nSecond scene",
      videoUrl: "/video.mp4",
      durationSec: 8,
      characterRefs: [{ imageUrl: "/hero.png", name: "Hero" }],
      prompt: "Cinematic",
      canvasId: "canvas-1",
      nodeId: "script-1",
    });
  });

  it("uses the local prompt as source and rejects an empty source", () => {
    expect(
      buildCanvasStoryScriptCommand({
        references: [{ nodeId: "audio-1", kind: "audio" }],
        prompt: " Local story ",
        canvasId: "default",
        nodeId: "script-1",
      }),
    ).toEqual({
      sourceText: "Local story",
      canvasId: "default",
      nodeId: "script-1",
    });
    expect(
      buildCanvasStoryScriptCommand({
        references: [{ nodeId: "image-1", kind: "image" }],
        prompt: " ",
        canvasId: "default",
        nodeId: "script-1",
      }),
    ).toBeNull();
  });

  it("submits, persists and completes the script task", async () => {
    const task = {
      task_key: "script-task",
      task_type: "freezone_story_script",
      job_id: "script-job",
    };
    const scriptResult = {
      title: "Episode",
      rows: [{ shot_no: 1, dialogue: "Line" }],
    };
    const submissionGateway: CanvasStoryScriptSubmissionGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: Pick<
      CanvasGenerationTaskGateway,
      "awaitCompletion" | "fetchStoryScriptResult"
    > = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
      fetchStoryScriptResult: vi.fn().mockResolvedValue(scriptResult),
    };
    const onTaskSubmitted = vi.fn();
    const command = {
      sourceText: "Story",
      canvasId: "default",
      nodeId: "script-1",
    };

    await expect(
      generateCanvasStoryScript(
        { projectId: "project-1", command },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, scriptResult });
    expect(submissionGateway.submit).toHaveBeenCalledWith(
      "project-1",
      command,
    );
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
    expect(taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "script-task",
      "project-1",
    );
    expect(taskGateway.fetchStoryScriptResult).toHaveBeenCalledWith(
      "project-1",
      "script-job",
    );
    expect(isCanvasStoryScriptResult(scriptResult)).toBe(true);
    expect(isCanvasStoryScriptResult({ rows: null })).toBe(false);
  });
});
