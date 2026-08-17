// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readPipelineStatus,
  startStoryIngestion,
  uploadStoryDocument,
} = vi.hoisted(
  () => ({
    readPipelineStatus: vi.fn(),
    startStoryIngestion: vi.fn(),
    uploadStoryDocument: vi.fn(),
  }),
);

vi.mock("@/modules/narrative_planning/public", () => ({ readPipelineStatus }));
vi.mock("@/modules/story_intake/public", () => ({
  startStoryIngestion,
  uploadStoryDocument,
}));

import {
  projectHasIngestedContent,
  startNovelIngest,
  uploadNovelForIngest,
} from "@/modules/ai_assistant/infrastructure/ingestAutomationGateway";

describe("SuperChat ingest automation gateway", () => {
  beforeEach(() => {
    readPipelineStatus.mockReset();
    startStoryIngestion.mockReset();
    uploadStoryDocument.mockReset();
  });

  it("converts a decoded attachment blob into the canonical upload file", async () => {
    const uploadResult = { filename: "stored.txt", size: 5 };
    uploadStoryDocument.mockResolvedValue(uploadResult);

    await expect(
      uploadNovelForIngest("project-a", {
        blob: new Blob(["hello"], { type: "text/plain" }),
        filename: "story.txt",
      }),
    ).resolves.toBe(uploadResult);

    expect(uploadStoryDocument).toHaveBeenCalledTimes(1);
    const [project, file] = uploadStoryDocument.mock.calls[0] as [string, File];
    expect(project).toBe("project-a");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("story.txt");
    expect(file.type).toBe("text/plain");
    expect(file.size).toBe(5);
  });

  it("starts a normal or rebuilding ingest with an explicit rebuild flag", async () => {
    const started = {
      taskType: "story_ingest",
      taskKey: "task-1",
      message: "started",
    };
    startStoryIngestion.mockResolvedValue(started);

    await expect(startNovelIngest("project-a", "story.txt")).resolves.toBe(started);
    expect(startStoryIngestion).toHaveBeenLastCalledWith("project-a", {
      filename: "story.txt",
      rebuild: false,
    });

    await expect(
      startNovelIngest("project-a", "story.txt", { rebuild: true }),
    ).resolves.toBe(started);
    expect(startStoryIngestion).toHaveBeenLastCalledWith("project-a", {
      filename: "story.txt",
      rebuild: true,
    });
  });

  it("projects pipeline status into whether the project has ingested content", async () => {
    readPipelineStatus
      .mockResolvedValueOnce({ data: { global: { ingested: true } } })
      .mockResolvedValueOnce({ data: { global: { ingested: false } } })
      .mockResolvedValueOnce({ data: {} });

    await expect(projectHasIngestedContent("project-a")).resolves.toBe(true);
    await expect(projectHasIngestedContent("project-b")).resolves.toBe(false);
    await expect(projectHasIngestedContent("project-c")).resolves.toBe(false);
    expect(readPipelineStatus).toHaveBeenNthCalledWith(1, "project-a");
    expect(readPipelineStatus).toHaveBeenNthCalledWith(2, "project-b");
    expect(readPipelineStatus).toHaveBeenNthCalledWith(3, "project-c");
  });

  it("propagates infrastructure failures to the application controller", async () => {
    const error = new Error("offline");
    readPipelineStatus.mockRejectedValue(error);
    await expect(projectHasIngestedContent("project-a")).rejects.toBe(error);
  });
});
