// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@/shared/api/transport", () => ({ api: { post } }));

import {
  appendChatNotification,
  cancelChatBestEffort,
} from "@/features/superchat/chat-commands";

describe("SuperChat HTTP commands", () => {
  beforeEach(() => {
    post.mockReset();
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
});
