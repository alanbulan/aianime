// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasStore } from "./canvasStore";
import { useCanvasGenerationRecoveryController } from "./composition";
import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
import type {
  CanvasNode,
  CanvasNodeType,
} from "@/modules/creative_canvas/public";

const generationMocks = vi.hoisted(() => ({
  pollExportImageGeneration: vi.fn(),
  resumeNodeGeneration: vi.fn(),
}));

vi.mock("@/modules/creative_canvas/public", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/creative_canvas/public")
  >()),
  pollExportImageGeneration: generationMocks.pollExportImageGeneration,
  resumeNodeGeneration: generationMocks.resumeNodeGeneration,
}));

function generationNode(
  id: string,
  type: CanvasNodeType,
  data: Record<string, unknown>,
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  } as CanvasNode;
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("Canvas generation recovery composition", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
    generationMocks.pollExportImageGeneration
      .mockReset()
      .mockResolvedValue(undefined);
    generationMocks.resumeNodeGeneration
      .mockReset()
      .mockResolvedValue(undefined);
  });

  it("binds pending store nodes to the existing polling and resume use cases", () => {
    const exportNode = generationNode(
      "export-node",
      CANVAS_NODE_TYPES.exportImage,
      {
        generationJobId: "job-1",
        isGenerating: true,
      },
    );
    const resumeNode = generationNode(
      "resume-node",
      CANVAS_NODE_TYPES.imageGen,
      {
        generationTaskJobId: "job-2",
        generationTaskKey: "composition-resume-task-1",
        generationTaskType: "freezone_gen",
        isGenerating: true,
      },
    );
    useCanvasStore.getState().setCanvasData([exportNode, resumeNode], []);

    renderHook(() =>
      useCanvasGenerationRecoveryController({
        projectId: "project-1",
        errorTitle: "生成失败",
      }),
    );

    const pollParams = generationMocks.pollExportImageGeneration.mock
      .calls[0]?.[0];
    expect(pollParams).toEqual(
      expect.objectContaining({
        nodeId: "export-node",
        errorTitle: "生成失败",
        updateNodeData: useCanvasStore.getState().updateNodeData,
      }),
    );
    expect(pollParams?.getNodeData("export-node")).toBe(
      useCanvasStore.getState().nodes[0]?.data,
    );
    const resumeParams = generationMocks.resumeNodeGeneration.mock.calls[0]?.[0];
    expect(resumeParams).toEqual(
      expect.objectContaining({
        node: useCanvasStore.getState().nodes[1],
        projectId: "project-1",
        updateNodeData: useCanvasStore.getState().updateNodeData,
      }),
    );
    expect(resumeParams?.getNodeData("resume-node")).toBe(
      useCanvasStore.getState().nodes[1]?.data,
    );
  });

  it("keeps pending ID selections stable across unrelated node updates", async () => {
    const pollRun = deferred();
    generationMocks.pollExportImageGeneration.mockReturnValue(pollRun.promise);
    const exportNode = generationNode(
      "export-node",
      CANVAS_NODE_TYPES.exportImage,
      {
        generationJobId: "job-1",
        isGenerating: true,
      },
    );
    useCanvasStore.getState().setCanvasData([exportNode], []);
    renderHook(() =>
      useCanvasGenerationRecoveryController({
        projectId: "project-1",
        errorTitle: "生成失败",
      }),
    );

    await act(async () => pollRun.resolve());
    act(() => {
      useCanvasStore.setState({
        nodes: [{ ...exportNode, position: { x: 40, y: 20 } }],
      });
    });

    expect(generationMocks.pollExportImageGeneration).toHaveBeenCalledOnce();
  });
});
