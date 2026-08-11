// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasDisplaySummary } from "./canvasBrowserViewModel";
import { CanvasBrowserView } from "./CanvasBrowserView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function canvas(
  id: string,
  overrides: Partial<CanvasDisplaySummary> = {},
): CanvasDisplaySummary {
  return {
    id,
    modified_at: "2026-06-03T00:00:00Z",
    size: 1,
    ...overrides,
  };
}

function props(
  overrides: Partial<ComponentProps<typeof CanvasBrowserView>> = {},
): ComponentProps<typeof CanvasBrowserView> {
  return {
    currentCanvasId: "default",
    hasPresetLabel: false,
    username: "alice",
    sections: {
      defaultCanvas: canvas("default", { canvas_scope: "default" }),
      memberCanvases: [],
      otherCanvases: [],
    },
    loading: false,
    error: null,
    newCanvasName: "故事实验",
    creatingCanvas: false,
    deletingCanvasId: null,
    restoringMainline: false,
    onNewCanvasNameChange: vi.fn(),
    onSwitch: vi.fn(),
    onRestoreMainline: vi.fn(),
    onCreateCanvas: vi.fn(),
    onDeleteCanvas: vi.fn(),
    ...overrides,
  };
}

describe("CanvasBrowserView", () => {
  it("wires canvas-name editing and creation", () => {
    const onNewCanvasNameChange = vi.fn();
    const onCreateCanvas = vi.fn();
    render(
      <CanvasBrowserView
        {...props({ onNewCanvasNameChange, onCreateCanvas })}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("freezone.canvases.createPlaceholder"),
      { target: { value: "新画布" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "freezone.canvases.create" }),
    );

    expect(onNewCanvasNameChange).toHaveBeenCalledWith("新画布");
    expect(onCreateCanvas).toHaveBeenCalledTimes(1);
  });

  it("opens the section containing the current canvas and can collapse it", () => {
    const member = canvas("member", {
      displayKind: "personal",
      displayName: "成员画布",
    });
    render(
      <CanvasBrowserView
        {...props({
          currentCanvasId: member.id,
          sections: {
            defaultCanvas: canvas("default", { canvas_scope: "default" }),
            memberCanvases: [member],
            otherCanvases: [],
          },
        })}
      />,
    );

    expect(screen.getByText("成员画布")).toBeInTheDocument();
    fireEvent.click(
      screen.getByTitle("freezone.canvases.collapseMemberCanvases"),
    );
    expect(screen.queryByText("成员画布")).not.toBeInTheDocument();
  });

  it("confirms restore and delete actions with the application dialog", () => {
    const current = canvas("asset_1", { canvas_scope: "asset" });
    const onRestoreMainline = vi.fn();
    const onDeleteCanvas = vi.fn();
    render(
      <CanvasBrowserView
        {...props({
          currentCanvasId: current.id,
          hasPresetLabel: true,
          sections: {
            defaultCanvas: canvas("user_alice_abc123", {
              displayKind: "personal",
              displayName: "alice",
            }),
            memberCanvases: [],
            otherCanvases: [current],
          },
          onRestoreMainline,
          onDeleteCanvas,
        })}
      />,
    );

    fireEvent.click(screen.getByTitle("freezone.canvases.restoreTitle"));
    expect(onRestoreMainline).not.toHaveBeenCalled();
    expect(
      screen.getByText("freezone.canvases.restoreDialogTitle"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "freezone.canvases.restore" }),
    );

    fireEvent.click(screen.getByTitle("freezone.canvases.deleteTitle"));
    expect(onDeleteCanvas).not.toHaveBeenCalled();
    expect(screen.getByText("freezone.canvases.deleteConfirm")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "freezone.canvases.delete" }),
    );

    expect(onRestoreMainline).toHaveBeenCalledTimes(1);
    expect(onDeleteCanvas).toHaveBeenCalledWith(current);
  });
});
