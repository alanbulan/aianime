// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FreezoneProjectPageController } from "../hooks/useFreezoneProjectPageController";
import { FreezoneProjectPageView } from "./FreezoneProjectPageView";

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/GlobalErrorDialog", () => ({
  GlobalErrorDialog: ({
    isOpen,
    onClose,
    title,
  }: {
    isOpen: boolean;
    onClose(): void;
    title: string;
  }) => isOpen
    ? <button type="button" onClick={onClose}>{title}</button>
    : null,
}));

vi.mock("../FreezoneShell", () => ({
  FreezoneShell: ({
    canvasId,
    project,
  }: {
    canvasId: string;
    project: { id: string };
  }) => <div>{project.id}:{canvasId}</div>,
}));

describe("FreezoneProjectPageView", () => {
  it("renders the loading state", () => {
    const { container } = render(
      <FreezoneProjectPageView controller={{ status: "loading" }} />,
    );

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders the missing project action", () => {
    const returnToProjects = vi.fn();
    render(
      <FreezoneProjectPageView
        controller={{
          status: "not-found",
          projectId: "missing-project",
          returnToProjects,
        }}
      />,
    );

    expect(screen.getByText("项目不存在")).toBeInTheDocument();
    expect(screen.getByText("missing-project")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回项目" }));
    expect(returnToProjects).toHaveBeenCalledOnce();
  });

  it("renders the ready shell and global error", () => {
    const closeGlobalError = vi.fn();
    const controller: FreezoneProjectPageController = {
      status: "ready",
      project: {
        id: "project-a",
        name: "Project A",
        status: "active",
      },
      canvasId: "canvas-a",
      globalError: { title: "失败", message: "保存失败" },
      closeGlobalError,
    };
    render(<FreezoneProjectPageView controller={controller} />);

    expect(screen.getByText("project-a:canvas-a")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "失败" }));
    expect(closeGlobalError).toHaveBeenCalledOnce();
  });
});
