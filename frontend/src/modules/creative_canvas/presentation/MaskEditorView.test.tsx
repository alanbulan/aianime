// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MaskEditorView } from "./MaskEditorView";
import type { MaskEditorController } from "./useMaskEditorController";

function createController(
  overrides: Partial<MaskEditorController> = {},
): MaskEditorController {
  return {
    baseCanvasRef: { current: null },
    maskCanvasRef: { current: null },
    tool: "brush",
    setTool: vi.fn(),
    brushSize: 50,
    setBrushSize: vi.fn(),
    prompt: "",
    setPrompt: vi.fn(),
    imageReady: true,
    submitting: false,
    progressMessage: null,
    error: null,
    modelCatalogErrorMessage: null,
    modelCatalogLoading: false,
    selectedModelLabel: "Image Edit",
    hasModel: true,
    canSubmit: true,
    canvasCursor: "crosshair",
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    clearMask: vi.fn(),
    submit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("MaskEditorView", () => {
  it("renders editor state and delegates commands to the controller", () => {
    const controller = createController();
    const close = vi.fn();
    render(
      <MaskEditorView
        baseUrl="base.png"
        baseLabel="角色立绘"
        onClose={close}
        controller={controller}
      />,
    );

    expect(screen.getByText("角色立绘")).toBeInTheDocument();
    expect(screen.getByText(/Image Edit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /橡皮/ }));
    fireEvent.click(screen.getByRole("button", { name: "25" }));
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    fireEvent.change(
      screen.getByPlaceholderText(/蒙版区域改成什么/),
      { target: { value: "替换背景" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(controller.setTool).toHaveBeenCalledWith("eraser");
    expect(controller.setBrushSize).toHaveBeenCalledWith(25);
    expect(controller.clearMask).toHaveBeenCalledOnce();
    expect(controller.setPrompt).toHaveBeenCalledWith("替换背景");
    expect(controller.submit).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("prioritizes progress and error feedback and blocks unavailable submit", () => {
    const controller = createController({
      canSubmit: false,
      error: "生成失败",
      hasModel: false,
    });
    const { rerender } = render(
      <MaskEditorView
        baseUrl="base.png"
        onClose={vi.fn()}
        controller={controller}
      />,
    );

    expect(screen.getByText("生成失败")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    rerender(
      <MaskEditorView
        baseUrl="base.png"
        onClose={vi.fn()}
        controller={createController({ progressMessage: "处理中" })}
      />,
    );
    expect(screen.getByText("处理中")).toBeInTheDocument();
  });
});
