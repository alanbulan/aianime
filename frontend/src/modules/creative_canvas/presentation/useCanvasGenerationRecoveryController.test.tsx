// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUseCanvasGenerationRecoveryController,
  type CanvasGenerationRecoveryControllerDependencies,
} from "./useCanvasGenerationRecoveryController";

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

describe("useCanvasGenerationRecoveryController", () => {
  const pendingExportImageNodeIds = ["export-node"];
  const pendingGenerationResumeNodeIds = ["resume-node"];
  const pollExportImageNode = vi.fn();
  const resumePendingGenerationNode = vi.fn();
  const dependencies: CanvasGenerationRecoveryControllerDependencies = {
    usePendingExportImageNodeIds: () => pendingExportImageNodeIds,
    usePendingGenerationResumeNodeIds: () =>
      pendingGenerationResumeNodeIds,
    pollExportImageNode,
    resumePendingGenerationNode,
  };
  const useCanvasGenerationRecoveryController =
    createUseCanvasGenerationRecoveryController(dependencies);

  beforeEach(() => {
    pollExportImageNode.mockReset().mockResolvedValue(undefined);
    resumePendingGenerationNode.mockReset().mockResolvedValue(undefined);
  });

  it("polls export jobs and resumes persisted generation tasks through ports", () => {
    renderHook(() =>
      useCanvasGenerationRecoveryController({
        projectId: "project-1",
        errorTitle: "生成失败",
      }),
    );

    expect(pollExportImageNode).toHaveBeenCalledWith({
      projectId: "project-1",
      nodeId: "export-node",
      errorTitle: "生成失败",
    });
    expect(resumePendingGenerationNode).toHaveBeenCalledWith({
      projectId: "project-1",
      nodeId: "resume-node",
    });
  });

  it("does not poll or resume tasks without an explicit project", () => {
    renderHook(() =>
      useCanvasGenerationRecoveryController({
        projectId: null,
        errorTitle: "生成失败",
      }),
    );

    expect(pollExportImageNode).not.toHaveBeenCalled();
    expect(resumePendingGenerationNode).not.toHaveBeenCalled();
  });

  it("does not restart a settled job when unrelated inputs rerender", async () => {
    const pollRun = deferred();
    pollExportImageNode.mockReturnValue(pollRun.promise);
    const { rerender } = renderHook(
      ({ marker }) => {
        void marker;
        useCanvasGenerationRecoveryController({
          projectId: "project-1",
          errorTitle: "生成失败",
        });
      },
      { initialProps: { marker: 0 } },
    );

    await act(async () => pollRun.resolve());
    rerender({ marker: 1 });

    expect(pollExportImageNode).toHaveBeenCalledOnce();
  });
});
