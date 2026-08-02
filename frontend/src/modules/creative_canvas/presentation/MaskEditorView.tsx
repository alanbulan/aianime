// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";

import {
  MASK_EDITOR_BRUSH_SIZES,
  type MaskEditorController,
} from "./useMaskEditorController";

export interface MaskEditorViewProps {
  baseUrl: string;
  baseLabel?: string;
  onClose(): void;
  controller: MaskEditorController;
}

export function MaskEditorView({
  baseUrl,
  baseLabel,
  onClose,
  controller,
}: MaskEditorViewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6">
      <div className="bg-surface border border-border-default rounded-2xl w-[90vw] max-w-[1200px] h-[85vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <div>
            <div className="text-sm font-semibold text-text">
              ✏️ Mask 蒙版编辑
            </div>
            <div className="text-xs text-text-muted mt-0.5 truncate max-w-md">
              {baseLabel || baseUrl}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={controller.submitting}
            className="text-text-muted hover:text-text text-sm disabled:opacity-30"
            aria-label="关闭"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-2 border-b border-border-default flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <ToolButton
              active={controller.tool === "brush"}
              onClick={() => controller.setTool("brush")}
            >
              🖌 笔刷
            </ToolButton>
            <ToolButton
              active={controller.tool === "eraser"}
              onClick={() => controller.setTool("eraser")}
            >
              🧽 橡皮
            </ToolButton>
          </div>
          <div className="text-xs text-text-muted">|</div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-muted">大小</span>
            {MASK_EDITOR_BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => controller.setBrushSize(size)}
                className={
                  "px-1.5 py-0.5 rounded text-xs transition " +
                  (controller.brushSize === size
                    ? "bg-primary/12 text-primary"
                    : "text-text-muted hover:text-text")
                }
              >
                {size}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={controller.clearMask}
            className="ml-auto rounded px-2.5 py-1 text-xs text-text-muted transition hover:text-destructive"
            title="清空蒙版"
          >
            清空
          </button>
        </div>

        <div className="flex-1 relative bg-bg-dark overflow-hidden flex items-center justify-center p-4">
          {!controller.imageReady && (
            <div className="text-text-muted text-sm">加载基底图...</div>
          )}
          <div
            className={
              "relative max-w-full max-h-full " +
              (controller.imageReady ? "" : "hidden")
            }
            style={{ cursor: controller.canvasCursor }}
          >
            <canvas
              ref={controller.baseCanvasRef}
              className="block max-w-full max-h-[calc(85vh-220px)] h-auto pointer-events-none"
            />
            <canvas
              ref={controller.maskCanvasRef}
              onPointerDown={controller.onPointerDown}
              onPointerMove={controller.onPointerMove}
              onPointerUp={controller.onPointerUp}
              onPointerLeave={controller.onPointerUp}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: "none" }}
            />
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-border-default space-y-2">
          <textarea
            value={controller.prompt}
            onChange={(event) => controller.setPrompt(event.target.value)}
            placeholder="蒙版区域改成什么？例：改成蓝色长发 / 加一束阳光 / 移除背景路人..."
            rows={2}
            disabled={controller.submitting}
            className="w-full px-3 py-2 rounded-lg bg-bg-dark border border-border-default text-text text-sm focus:outline-none focus:border-primary transition resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-text-muted/80 flex-1 min-w-0 truncate">
              {statusContent(controller)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={controller.submitting}
                className="px-3 py-1.5 rounded-lg text-text-muted hover:text-text text-sm transition disabled:opacity-30"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void controller.submit()}
                disabled={!controller.canSubmit}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {controller.submitting ? "处理中..." : "Apply"}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function statusContent(controller: MaskEditorController): ReactNode {
  if (controller.progressMessage) {
    return <span className="text-primary">{controller.progressMessage}</span>;
  }
  if (controller.error) {
    return <span className="text-destructive">{controller.error}</span>;
  }
  if (controller.modelCatalogErrorMessage) {
    return (
      <span className="text-destructive">
        {controller.modelCatalogErrorMessage}
      </span>
    );
  }
  if (controller.modelCatalogLoading) return <>正在加载图像模型...</>;
  if (!controller.hasModel) return <>暂无可用图像模型</>;
  return (
    <>
      红色 = 待编辑区域 · {controller.selectedModelLabel} · 可能 30-60 秒
    </>
  );
}

function ToolButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-2.5 py-1 rounded text-xs transition " +
        (active
          ? "bg-primary/12 text-primary border border-primary/40"
          : "border border-transparent text-text-muted hover:text-text")
      }
    >
      {children}
    </button>
  );
}
