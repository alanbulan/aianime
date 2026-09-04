// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  buildCanvasStoryScriptCommand,
  generateCanvasStoryScript,
  isCanvasStoryScriptResult,
  type CanvasStoryScriptSubmissionGateway,
  type CanvasStoryScriptTaskGateway,
} from "./generateCanvasStoryScript";

describe("Canvas story script generation", () => {
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
    const taskGateway: CanvasStoryScriptTaskGateway = {
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

  it("uses the script embedded in the completed task", async () => {
    const task = {
      task_key: "script-inline-task",
      task_type: "freezone_story_script",
      job_id: "script-inline-job",
    };
    const scriptResult = {
      title: "Embedded episode",
      rows: [{ shot_no: 1, dialogue: "Embedded line" }],
    };
    const taskGateway: CanvasStoryScriptTaskGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: scriptResult }),
      fetchStoryScriptResult: vi.fn(),
    };

    await expect(
      generateCanvasStoryScript(
        {
          projectId: "project-1",
          command: {
            sourceText: "Story",
            canvasId: "canvas-1",
            nodeId: "script-1",
          },
        },
        {
          submissionGateway: { submit: vi.fn().mockResolvedValue(task) },
          taskGateway,
          onTaskSubmitted: vi.fn(),
        },
      ),
    ).resolves.toEqual({ task, scriptResult });
    expect(taskGateway.fetchStoryScriptResult).not.toHaveBeenCalled();
  });

  it("rejects a completed task with an invalid fallback script", async () => {
    const task = {
      task_key: "script-invalid-task",
      task_type: "freezone_story_script",
      job_id: "script-invalid-job",
    };

    await expect(
      generateCanvasStoryScript(
        {
          projectId: "project-1",
          command: {
            sourceText: "Story",
            canvasId: "canvas-1",
            nodeId: "script-1",
          },
        },
        {
          submissionGateway: { submit: vi.fn().mockResolvedValue(task) },
          taskGateway: {
            awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
            fetchStoryScriptResult: vi.fn().mockResolvedValue({ rows: null }),
          },
          onTaskSubmitted: vi.fn(),
        },
      ),
    ).rejects.toThrow("剧本生成任务已完成，但返回的剧本结构无效");
  });
});
