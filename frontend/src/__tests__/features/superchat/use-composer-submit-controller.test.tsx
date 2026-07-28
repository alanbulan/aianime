// Copyright (c) 2026 AI anime
import type { TFunction } from "i18next";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatAttachment } from "@/features/superchat/types";

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

import { useComposerSubmitController } from "@/features/superchat/use-composer-submit-controller";

const t = ((key: string) => key) as TFunction;
type SubmitOptions = Parameters<typeof useComposerSubmitController>[0];

function options(overrides: Partial<SubmitOptions> = {}): SubmitOptions {
  return {
    attachments: [],
    busy: false,
    clearAttachments: vi.fn(),
    connected: true,
    draft: "",
    enqueueMessage: vi.fn(),
    onDraftChange: vi.fn(),
    preparingSend: false,
    resetHistorySelection: vi.fn(),
    sendMessage: vi.fn(async () => true),
    t,
    ...overrides,
  };
}

describe("SuperChat Composer submit controller", () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  it("ignores empty content and an in-progress preparation", () => {
    const emptyOptions = options();
    const { result, rerender } = renderHook(
      ({ value }) => useComposerSubmitController(value),
      { initialProps: { value: emptyOptions } },
    );

    act(() => result.current());
    expect(emptyOptions.resetHistorySelection).not.toHaveBeenCalled();
    expect(emptyOptions.sendMessage).not.toHaveBeenCalled();

    const preparingOptions = options({ draft: "消息", preparingSend: true });
    rerender({ value: preparingOptions });
    act(() => result.current());
    expect(preparingOptions.resetHistorySelection).not.toHaveBeenCalled();
    expect(preparingOptions.sendMessage).not.toHaveBeenCalled();
  });

  it("reports a disconnected submission without mutating the draft", () => {
    const submitOptions = options({ connected: false, draft: "消息" });
    const { result } = renderHook(() =>
      useComposerSubmitController(submitOptions),
    );

    act(() => result.current());

    expect(toastError).toHaveBeenCalledWith("aiAssistant.waiting");
    expect(submitOptions.resetHistorySelection).not.toHaveBeenCalled();
    expect(submitOptions.onDraftChange).not.toHaveBeenCalled();
    expect(submitOptions.clearAttachments).not.toHaveBeenCalled();
  });

  it("queues a busy submission with cloned attachments and clears the composer", () => {
    const attachment: ChatAttachment = { fileName: "story.txt" };
    const submitOptions = options({
      attachments: [attachment],
      busy: true,
      draft: "  ",
    });
    const { result } = renderHook(() =>
      useComposerSubmitController(submitOptions),
    );

    act(() => result.current());

    expect(submitOptions.resetHistorySelection).toHaveBeenCalledTimes(1);
    expect(submitOptions.enqueueMessage).toHaveBeenCalledWith(
      "aiAssistant.attachmentOnlyPrompt",
      [{ fileName: "story.txt" }],
    );
    const queuedAttachments = vi.mocked(submitOptions.enqueueMessage).mock.calls[0][1];
    expect(queuedAttachments[0]).not.toBe(attachment);
    expect(submitOptions.onDraftChange).toHaveBeenCalledWith("");
    expect(submitOptions.clearAttachments).toHaveBeenCalledTimes(1);
    expect(submitOptions.sendMessage).not.toHaveBeenCalled();
  });

  it("clears only a successful direct submission", async () => {
    const sendMessage = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const submitOptions = options({ draft: "  正文  ", sendMessage });
    const { result } = renderHook(() =>
      useComposerSubmitController(submitOptions),
    );

    await act(async () => {
      result.current();
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenLastCalledWith("正文", []);
    expect(submitOptions.onDraftChange).not.toHaveBeenCalled();
    expect(submitOptions.clearAttachments).not.toHaveBeenCalled();

    await act(async () => {
      result.current();
      await Promise.resolve();
    });
    expect(submitOptions.onDraftChange).toHaveBeenCalledWith("");
    expect(submitOptions.clearAttachments).toHaveBeenCalledTimes(1);
    expect(submitOptions.resetHistorySelection).toHaveBeenCalledTimes(2);
  });
});
