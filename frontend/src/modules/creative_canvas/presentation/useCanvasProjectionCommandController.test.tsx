// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasProjectionCommands } from "../application/canvasProjection";
import type {
  CanvasProjectionCommandEventSource,
  CanvasProjectionCommandEventType,
} from "../application/canvasProjectionCommandEvents";
import {
  createUseCanvasProjectionCommandController,
  type CanvasProjectionCommandControllerOptions,
} from "./useCanvasProjectionCommandController";

const handlers = new Map<
  CanvasProjectionCommandEventType,
  Set<(payload: { projectionKey: string }) => void>
>();
const events: CanvasProjectionCommandEventSource = {
  subscribe: vi.fn((type, handler) => {
    const listeners = handlers.get(type) ?? new Set();
    listeners.add(handler);
    handlers.set(type, listeners);
    return () => listeners.delete(handler);
  }),
};
const commands: CanvasProjectionCommands = {
  sync: vi.fn(),
  remove: vi.fn(),
};
const useCanvasProjectionCommandController =
  createUseCanvasProjectionCommandController({ events, commands });

function publish(
  type: CanvasProjectionCommandEventType,
  projectionKey = "beat:1:4",
): void {
  for (const handler of handlers.get(type) ?? []) {
    handler({ projectionKey });
  }
}

function createOptions(
  overrides: Partial<CanvasProjectionCommandControllerOptions> = {},
): CanvasProjectionCommandControllerOptions {
  return {
    projectId: "project-a",
    canvasId: "user_eric",
    metadata: { projections: {} },
    messages: {
      syncMissingRequest: "missing request",
      syncSuccess: "synced",
      removeBlocked: "remove blocked",
      removeSuccess: "removed",
    },
    onMessage: vi.fn(),
    ...overrides,
  };
}

describe("canvas projection command controller", () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(events.subscribe).mockClear();
    vi.mocked(commands.sync).mockReset().mockResolvedValue(true);
    vi.mocked(commands.remove).mockReset().mockReturnValue(true);
  });

  it("subscribes once and prevents duplicate projection syncs", async () => {
    let resolveSync!: (value: boolean) => void;
    vi.mocked(commands.sync).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );
    const options = createOptions();
    const hook = renderHook(() =>
      useCanvasProjectionCommandController(options),
    );

    act(() => {
      publish("freezone/projection-sync");
      publish("freezone/projection-sync");
    });
    expect(commands.sync).toHaveBeenCalledTimes(1);
    expect(commands.sync).toHaveBeenCalledWith({
      projectId: "project-a",
      canvasId: "user_eric",
      metadata: { projections: {} },
      projectionKey: "beat:1:4",
    });

    await act(async () => {
      resolveSync(true);
      await Promise.resolve();
    });
    expect(options.onMessage).toHaveBeenCalledWith("synced");

    hook.unmount();
    publish("freezone/projection-sync");
    expect(commands.sync).toHaveBeenCalledTimes(1);
  });

  it("reports missing projection requests and sync failures", async () => {
    const options = createOptions();
    const hook = renderHook(() =>
      useCanvasProjectionCommandController(options),
    );

    vi.mocked(commands.sync).mockResolvedValueOnce(false);
    await act(async () => {
      publish("freezone/projection-sync");
      await Promise.resolve();
    });
    expect(options.onMessage).toHaveBeenLastCalledWith("missing request");

    vi.mocked(commands.sync).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      publish("freezone/projection-sync");
      await Promise.resolve();
    });
    expect(options.onMessage).toHaveBeenLastCalledWith("offline");
    hook.unmount();
  });

  it("routes projection removal success and blocking messages", () => {
    const options = createOptions();
    const hook = renderHook(() =>
      useCanvasProjectionCommandController(options),
    );

    act(() => publish("freezone/projection-remove"));
    expect(commands.remove).toHaveBeenLastCalledWith({
      projectId: "project-a",
      canvasId: "user_eric",
      projectionKey: "beat:1:4",
    });
    expect(options.onMessage).toHaveBeenLastCalledWith("removed");

    vi.mocked(commands.remove).mockReturnValueOnce(false);
    act(() => publish("freezone/projection-remove"));
    expect(options.onMessage).toHaveBeenLastCalledWith("remove blocked");
    hook.unmount();
  });
});
