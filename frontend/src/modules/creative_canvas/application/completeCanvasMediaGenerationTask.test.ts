// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  completeCanvasMediaGenerationTask,
  recoverCanvasMediaGenerationTask,
  requireCanvasGenerationTaskRef,
} from "./completeCanvasMediaGenerationTask";
import type {
  CanvasRecoverableTaskResultGateway,
  CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

const task = {
  task_key: "media-task",
  task_type: "freezone_media_task",
  job_id: "media-job",
};

describe("completeCanvasMediaGenerationTask", () => {
  it("persists the task before returning its embedded output URL", async () => {
    const onTaskSubmitted = vi.fn();
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/output.png" },
      }),
      fetchResultUrl: vi.fn(),
    };

    await expect(
      completeCanvasMediaGenerationTask(
        { projectId: "project-1", task, media: "image" },
        { taskGateway, onTaskSubmitted },
      ),
    ).resolves.toBe("/static/output.png");
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
    expect(onTaskSubmitted.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(taskGateway.awaitCompletion).mock.invocationCallOrder[0] ?? 0,
    );
    expect(taskGateway.fetchResultUrl).not.toHaveBeenCalled();
  });

  it("falls back to the dedicated result endpoint", async () => {
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
      fetchResultUrl: vi.fn().mockResolvedValue("/static/fallback.mp4"),
    };

    await expect(
      completeCanvasMediaGenerationTask(
        { projectId: "project-1", task, media: "video" },
        { taskGateway, onTaskSubmitted: vi.fn() },
      ),
    ).resolves.toBe("/static/fallback.mp4");
    expect(taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_media_task",
      "media-job",
    );
  });

  it("ignores malformed embedded results and uses the result endpoint", async () => {
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: 42 },
      }),
      fetchResultUrl: vi.fn().mockResolvedValue("/static/safe-fallback.png"),
    };

    await expect(
      completeCanvasMediaGenerationTask(
        { projectId: "project-1", task, media: "image" },
        { taskGateway, onTaskSubmitted: vi.fn() },
      ),
    ).resolves.toBe("/static/safe-fallback.png");
  });

  it("reads media-specific embedded URL aliases without a second result request", async () => {
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: {
          image_url: "/static/preview.png",
          video_url: "/static/output.mp4",
        },
      }),
      fetchResultUrl: vi.fn(),
    };

    await expect(
      completeCanvasMediaGenerationTask(
        { projectId: "project-1", task, media: "video" },
        { taskGateway, onTaskSubmitted: vi.fn() },
      ),
    ).resolves.toBe("/static/output.mp4");
    expect(taskGateway.fetchResultUrl).not.toHaveBeenCalled();
  });

  it("rejects a completed task when neither result source has a media URL", async () => {
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: {} }),
      fetchResultUrl: vi.fn().mockResolvedValue(""),
    };

    await expect(
      completeCanvasMediaGenerationTask(
        { projectId: "project-1", task, media: "image" },
        { taskGateway, onTaskSubmitted: vi.fn() },
      ),
    ).rejects.toThrow("生成任务已完成，但没有返回可用的媒体地址");
  });

  it("rejects an incomplete submission receipt before task monitoring starts", async () => {
    const onTaskSubmitted = vi.fn();
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn(),
      fetchResultUrl: vi.fn(),
    };

    await expect(
      completeCanvasMediaGenerationTask(
        {
          projectId: "project-1",
          task: { ...task, task_key: "" },
          media: "image",
        },
        { taskGateway, onTaskSubmitted },
      ),
    ).rejects.toThrow("生成任务回执不完整");
    expect(onTaskSubmitted).not.toHaveBeenCalled();
    expect(taskGateway.awaitCompletion).not.toHaveBeenCalled();
  });

  it("rejects a receipt for a different task type", () => {
    expect(() =>
      requireCanvasGenerationTaskRef(task, "freezone_video_upscale"),
    ).toThrow(
      "生成任务类型不匹配：预期 freezone_video_upscale，实际 freezone_media_task",
    );
  });

  it("recovers a durable artifact when the persisted task record has expired", async () => {
    const taskGateway: CanvasRecoverableTaskResultGateway = {
      hasTask: vi.fn().mockResolvedValue(false),
      awaitCompletion: vi.fn(),
      fetchResultUrl: vi.fn().mockResolvedValue(" /static/recovered.png "),
    };

    await expect(
      recoverCanvasMediaGenerationTask(
        { projectId: "project-1", task, media: "image" },
        taskGateway,
      ),
    ).resolves.toBe("/static/recovered.png");
    expect(taskGateway.awaitCompletion).not.toHaveBeenCalled();
    expect(taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_media_task",
      "media-job",
    );
  });

  it("uses the task monitor when checking the persisted task transiently fails", async () => {
    const taskGateway: CanvasRecoverableTaskResultGateway = {
      hasTask: vi.fn().mockRejectedValue(new Error("offline")),
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/monitor-result.png" },
      }),
      fetchResultUrl: vi.fn(),
    };

    await expect(
      recoverCanvasMediaGenerationTask(
        { projectId: "project-1", task, media: "image" },
        taskGateway,
      ),
    ).resolves.toBe("/static/monitor-result.png");
    expect(taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "media-task",
      "project-1",
    );
  });
});
