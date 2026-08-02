// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUseFreezoneProjectPageController,
  type FreezoneProjectPageError,
} from "./useFreezoneProjectPageController";

const mocks = {
  canvasParam: null as string | null,
  errorHandler: null as ((detail: FreezoneProjectPageError) => void) | null,
  navigateToProjects: vi.fn(),
  projectsQuery: {
    data: undefined as Array<{
      id: string;
      name: string;
      status: "active";
    }> | undefined,
    isLoading: true,
  },
  readLastCanvas: vi.fn(),
  unsubscribe: vi.fn(),
  username: "writer@example.com" as string | null,
};

const useFreezoneProjectPageController =
  createUseFreezoneProjectPageController({
    useUsername: () => mocks.username,
    useProjectSummaries: () => mocks.projectsQuery,
    useCanvasParam: () => mocks.canvasParam,
    subscribeGlobalError: (listener) => {
      mocks.errorHandler = listener;
      return mocks.unsubscribe;
    },
    readLastCanvas: (projectId) => mocks.readLastCanvas(projectId),
    navigateToProjects: mocks.navigateToProjects,
  });

describe("useFreezoneProjectPageController", () => {
  beforeEach(() => {
    mocks.canvasParam = null;
    mocks.errorHandler = null;
    mocks.navigateToProjects.mockReset();
    mocks.projectsQuery.data = undefined;
    mocks.projectsQuery.isLoading = true;
    mocks.readLastCanvas.mockReset().mockReturnValue(null);
    mocks.unsubscribe.mockReset();
    mocks.username = "writer@example.com";
  });

  it("keeps the page loading until project summaries exist", () => {
    const { result } = renderHook(() =>
      useFreezoneProjectPageController("project-a"),
    );

    expect(result.current).toEqual({ status: "loading" });
  });

  it("matches by id and prefers the route canvas", () => {
    mocks.projectsQuery.data = [
      { id: "project-a", name: "Project A", status: "active" },
    ];
    mocks.projectsQuery.isLoading = false;
    mocks.canvasParam = "route-canvas";

    const { result } = renderHook(() =>
      useFreezoneProjectPageController("project-a"),
    );

    expect(result.current).toMatchObject({
      status: "ready",
      project: { id: "project-a" },
      canvasId: "route-canvas",
    });
    expect(mocks.readLastCanvas).not.toHaveBeenCalled();
  });

  it("matches by name and falls back to the last canvas", () => {
    mocks.projectsQuery.data = [
      { id: "project-a", name: "Project A", status: "active" },
    ];
    mocks.projectsQuery.isLoading = false;
    mocks.readLastCanvas.mockReturnValue("saved-canvas");

    const { result } = renderHook(() =>
      useFreezoneProjectPageController("Project A"),
    );

    expect(result.current).toMatchObject({
      status: "ready",
      project: { id: "project-a" },
      canvasId: "saved-canvas",
    });
    expect(mocks.readLastCanvas).toHaveBeenCalledWith("project-a");
  });

  it("returns missing projects to the project list", () => {
    mocks.projectsQuery.data = [];
    mocks.projectsQuery.isLoading = false;

    const { result } = renderHook(() =>
      useFreezoneProjectPageController("missing"),
    );
    expect(result.current).toMatchObject({
      status: "not-found",
      projectId: "missing",
    });

    const controller = result.current;
    if (controller.status === "not-found") {
      act(() => controller.returnToProjects());
    }
    expect(mocks.navigateToProjects).toHaveBeenCalledOnce();
  });

  it("exposes global errors and removes the subscription on unmount", () => {
    mocks.projectsQuery.data = [
      { id: "project-a", name: "Project A", status: "active" },
    ];
    mocks.projectsQuery.isLoading = false;

    const { result, unmount } = renderHook(() =>
      useFreezoneProjectPageController("project-a"),
    );
    act(() => {
      mocks.errorHandler?.({ title: "失败", message: "保存失败" });
    });
    expect(result.current).toMatchObject({
      status: "ready",
      globalError: { title: "失败", message: "保存失败" },
    });

    const controller = result.current;
    if (controller.status === "ready") {
      act(() => controller.closeGlobalError());
    }
    expect(result.current).toMatchObject({
      status: "ready",
      globalError: null,
    });

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});
