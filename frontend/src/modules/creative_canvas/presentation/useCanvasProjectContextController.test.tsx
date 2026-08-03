// Copyright (c) 2026 AI anime
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasBeatContextReferenceNodeLike } from "../domain/canvasBeatContextReferences";
import { useCanvasProjectContextController } from "./useCanvasProjectContextController";

const narrativeMocks = vi.hoisted(() => ({
  prefetchEpisodeBeats: vi.fn(),
  prefetchEpisodeDetail: vi.fn(),
}));

vi.mock("@/modules/narrative_planning/public", () => narrativeMocks);

function beatContextNode(): CanvasBeatContextReferenceNodeLike {
  return {
    type: "beatContextNode",
    data: { episode: 3 },
  };
}

describe("useCanvasProjectContextController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the explicit canvas context and prefetches both episode resources", () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ projectId, canvasId, nodes }) => useCanvasProjectContextController({
        projectId,
        canvasId,
        nodes,
      }),
      {
        initialProps: {
          projectId: "project-1",
          canvasId: "canvas-1",
          nodes: [beatContextNode()],
        },
        wrapper,
      },
    );

    expect(result.current).toEqual({
      projectId: "project-1",
      canvasId: "canvas-1",
    });
    expect(narrativeMocks.prefetchEpisodeBeats).toHaveBeenCalledWith(
      queryClient,
      "project-1",
      3,
    );
    expect(narrativeMocks.prefetchEpisodeDetail).toHaveBeenCalledWith(
      queryClient,
      "project-1",
      3,
    );

    rerender({
      projectId: "project-2",
      canvasId: "canvas-2",
      nodes: [beatContextNode()],
    });
    expect(result.current).toEqual({
      projectId: "project-2",
      canvasId: "canvas-2",
    });
    expect(narrativeMocks.prefetchEpisodeBeats).toHaveBeenLastCalledWith(
      queryClient,
      "project-2",
      3,
    );
  });
});
