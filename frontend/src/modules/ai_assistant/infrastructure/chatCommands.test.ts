// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, post } = vi.hoisted(() => ({
  apiCall: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/shared/api/transport", () => ({ api: { post } }));
vi.mock("@/shared/api/client", () => ({ apiCall }));

import {
  appendChatNotification,
  cancelChatBestEffort,
  resolveChatDecision,
  runChatSlashCommand,
} from "@/modules/ai_assistant/public";

describe("SuperChat HTTP commands", () => {
  beforeEach(() => {
    post.mockReset();
    apiCall.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not send an empty notification", async () => {
    await expect(
      appendChatNotification({ kind: "home", id: null }, "   "),
    ).resolves.toEqual({ delivered: false, message: null });
    expect(post).not.toHaveBeenCalled();
  });

  it("posts a trimmed notification and normalizes the server message", async () => {
    const json = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        id: "notification-1",
        role: "assistant",
        content: "任务已完成",
        timestamp: 20,
      },
    });
    post.mockReturnValue({ json });

    const result = await appendChatNotification(
      { kind: "project", id: "project-a" },
      "  任务已完成  ",
    );

    expect(post).toHaveBeenCalledWith("api/v1/chat/notifications", {
      json: {
        scope: { kind: "project", id: "project-a" },
        text: "任务已完成",
      },
    });
    expect(result).toMatchObject({
      delivered: true,
      message: {
        id: "notification-1",
        role: "assistant",
        text: "任务已完成",
        timestamp: 20,
      },
    });
  });

  it("returns a local fallback message when notification delivery fails", async () => {
    const error = new Error("offline");
    post.mockReturnValue({
      json: vi.fn().mockRejectedValue(error),
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await appendChatNotification(
      { kind: "project", id: "project-a" },
      "任务已完成",
    );

    expect(consoleError).toHaveBeenCalledWith(
      "[superchat] append notification failed",
      error,
    );
    expect(result.delivered).toBe(false);
    expect(result.message).toMatchObject({
      id: expect.stringMatching(/^task-notification-1000-/),
      role: "assistant",
      text: "任务已完成",
    });
  });

  it("sends cancellation without exposing transport response details", async () => {
    post.mockResolvedValue(undefined);

    await expect(cancelChatBestEffort()).resolves.toBeUndefined();

    expect(post).toHaveBeenCalledWith("api/v1/chat/cancel");
  });

  it("swallows cancellation transport failures", async () => {
    post.mockRejectedValue(new Error("offline"));

    await expect(cancelChatBestEffort()).resolves.toBeUndefined();
  });

  it("submits a structured decision answer through the out-of-band route", async () => {
    post.mockResolvedValue(undefined);

    await expect(resolveChatDecision("decision/1", [
      { question_id: "resolution", option_id: "1080p" },
    ])).resolves.toBeUndefined();

    expect(post).toHaveBeenCalledWith(
      "api/v1/chat/decisions/decision%2F1/resolve",
      {
        json: {
          answers: [
            { question_id: "resolution", option_id: "1080p" },
          ],
        },
      },
    );
  });

  it("runs a Slash command through the non-persisted command route", async () => {
    apiCall.mockResolvedValue({
      command: "context",
      text: "模型上下文：8 条消息",
    });

    await expect(runChatSlashCommand(
      { kind: "project", id: "project-a", conversationId: "main" },
      "context",
    )).resolves.toEqual({
      command: "context",
      text: "模型上下文：8 条消息",
    });

    expect(apiCall).toHaveBeenCalledWith("/chat/commands", {
      method: "post",
      json: {
        scope: { kind: "project", id: "project-a", conversationId: "main" },
        command: "context",
      },
      timeout: 90_000,
    });
    expect(post).not.toHaveBeenCalled();
  });
});
