// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatQueueController } from "@/features/superchat/use-chat-queue-controller";

type QueueOptions = Parameters<typeof useChatQueueController>[0];

function options(overrides: Partial<QueueOptions> = {}): QueueOptions {
  return {
    busy: true,
    connected: true,
    preparingSend: false,
    project: "project-a",
    sendMessage: vi.fn(async () => true),
    ...overrides,
  };
}

function deferredBoolean() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("SuperChat queue controller", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    let randomValue = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      randomValue += 0.1;
      return randomValue;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enqueues messages and cycles the selected item in both directions", () => {
    const queueOptions = options();
    const { result } = renderHook(() => useChatQueueController(queueOptions));

    act(() => {
      result.current.enqueueMessage("第一条", []);
      result.current.enqueueMessage("第二条", []);
      result.current.enqueueMessage("第三条", []);
    });

    expect(result.current.queuedMessages.map((message) => message.text)).toEqual([
      "第一条",
      "第二条",
      "第三条",
    ]);
    expect(result.current.queuedMessages[0]).toMatchObject({
      id: expect.stringMatching(/^queue-1000-/),
      createdAt: 1_000,
    });
    expect(result.current.selectedQueuedMessageId).toBe(
      result.current.queuedMessages[0].id,
    );

    act(() => result.current.selectQueuedMessageByOffset(-1));
    expect(result.current.selectedQueuedMessageId).toBe(
      result.current.queuedMessages[2].id,
    );
    act(() => result.current.selectQueuedMessageByOffset(1));
    expect(result.current.selectedQueuedMessageId).toBe(
      result.current.queuedMessages[0].id,
    );
  });

  it("waits for every send gate and removes only the selected successful item", async () => {
    const deferred = deferredBoolean();
    const sendMessage = vi.fn(() => deferred.promise);
    const { result, rerender } = renderHook(
      ({ value }) => useChatQueueController(value),
      {
        initialProps: {
          value: options({ connected: false, preparingSend: true, sendMessage }),
        },
      },
    );
    act(() => {
      result.current.enqueueMessage("第一条", []);
      result.current.enqueueMessage("第二条", [{ fileName: "story.txt" }]);
    });
    act(() => result.current.selectQueuedMessage(result.current.queuedMessages[1].id));

    rerender({
      value: options({ busy: false, connected: false, sendMessage }),
    });
    rerender({
      value: options({ busy: false, preparingSend: true, sendMessage }),
    });
    expect(sendMessage).not.toHaveBeenCalled();

    rerender({ value: options({ busy: false, sendMessage }) });
    expect(sendMessage).toHaveBeenCalledWith(
      "第二条",
      [{ fileName: "story.txt" }],
    );
    rerender({ value: options({ sendMessage }) });
    await act(async () => deferred.resolve(true));

    expect(result.current.queuedMessages.map((message) => message.text)).toEqual([
      "第一条",
    ]);
    expect(result.current.selectedQueuedMessageId).toBe(
      result.current.queuedMessages[0].id,
    );
  });

  it("retains a queued item when sending fails", async () => {
    const deferred = deferredBoolean();
    const sendMessage = vi.fn(() => deferred.promise);
    const { result, rerender } = renderHook(
      ({ value }) => useChatQueueController(value),
      { initialProps: { value: options({ sendMessage }) } },
    );
    act(() => result.current.enqueueMessage("保留", []));

    rerender({ value: options({ busy: false, sendMessage }) });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    rerender({ value: options({ sendMessage }) });
    await act(async () => deferred.resolve(false));

    expect(result.current.queuedMessages).toHaveLength(1);
    expect(result.current.queuedMessages[0].text).toBe("保留");
  });

  it("removes an item explicitly and clears the queue on project change", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useChatQueueController(value),
      { initialProps: { value: options() } },
    );
    act(() => {
      result.current.enqueueMessage("第一条", []);
      result.current.enqueueMessage("第二条", []);
    });

    act(() => result.current.removeQueuedMessage(result.current.queuedMessages[0].id));
    expect(result.current.queuedMessages.map((message) => message.text)).toEqual([
      "第二条",
    ]);

    rerender({ value: options({ project: "project-b" }) });
    expect(result.current.queuedMessages).toEqual([]);
    expect(result.current.selectedQueuedMessageId).toBeNull();
  });
});
