import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNodeGenerationHistory } from "@/features/canvas/hooks/useNodeGenerationHistory";

const mocks = vi.hoisted(() => ({
  getNodeGenerationHistory: vi.fn(),
}));

vi.mock("@/features/canvas/composition", () => ({
  getNodeGenerationHistory: (...args: unknown[]) =>
    mocks.getNodeGenerationHistory(...args),
}));

const HISTORY_CONTEXT = {
  projectId: "project-a",
  canvasId: "canvas-a",
  nodeId: "node-a",
} as const;

describe("useNodeGenerationHistory", () => {
  beforeEach(() => {
    mocks.getNodeGenerationHistory.mockReset().mockResolvedValue([]);
  });

  it("loads history with the explicit project and canvas context", async () => {
    renderHook(() =>
      useNodeGenerationHistory({
        ...HISTORY_CONTEXT,
        limit: 25,
      }),
    );

    await waitFor(() => {
      expect(mocks.getNodeGenerationHistory).toHaveBeenCalledWith({
        ...HISTORY_CONTEXT,
        limit: 25,
      });
    });
  });

  it("keeps disabled history idle until the caller refreshes it", async () => {
    const { result } = renderHook(() =>
      useNodeGenerationHistory({
        ...HISTORY_CONTEXT,
        enabled: false,
      }),
    );

    expect(mocks.getNodeGenerationHistory).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mocks.getNodeGenerationHistory).toHaveBeenCalledWith({
      ...HISTORY_CONTEXT,
      limit: 100,
    });
  });
});
