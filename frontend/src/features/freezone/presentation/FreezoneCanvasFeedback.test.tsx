// Copyright (c) 2026 AI anime
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ConflictSnapshot } from "@/modules/creative_canvas/public";
import {
  BackupStatusIndicator,
  CanvasConflictOverlay,
  CanvasErrorOverlay,
  FreezoneToast,
} from "./FreezoneCanvasFeedback";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const snapshot: ConflictSnapshot = {
  canvas_id: "canvas-a",
  nodes: [{ id: "node-a" }],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  metadata: null,
  timestamp: "2026-07-28T00:00:00.000Z",
};

describe("Freezone canvas feedback", () => {
  it("renders toast text and forwards close", () => {
    const onClose = vi.fn();
    render(<FreezoneToast text="saved" onClose={onClose} />);

    expect(screen.getByText("saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps successful backup states silent and distinguishes pending from failed", () => {
    const view = render(<BackupStatusIndicator status="synced" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    view.rerender(<BackupStatusIndicator status="pending" />);
    expect(screen.getByRole("status")).toHaveTextContent("云端备份中");

    view.rerender(<BackupStatusIndicator status="failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("云端备份失败");
  });

  it("forwards canvas retry from the error overlay", () => {
    const onRetry = vi.fn();
    render(<CanvasErrorOverlay error="offline" onRetry={onRetry} />);

    expect(screen.getByText("offline")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("uses the captured conflict snapshot while a copy save is pending", async () => {
    let resolveSave!: () => void;
    const onSaveCopy = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    const onRefresh = vi.fn();
    const readConflictSnapshot = vi.fn(() => snapshot);
    render(
      <CanvasConflictOverlay
        error={null}
        canvasId="canvas-a"
        onRefresh={onRefresh}
        onSaveCopy={onSaveCopy}
        readConflictSnapshot={readConflictSnapshot}
      />,
    );

    expect(readConflictSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "下载本地 JSON" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "另存为副本" }));
    expect(screen.getByRole("button", { name: "保存中..." })).toBeDisabled();
    expect(onSaveCopy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "另存为副本" })).toBeEnabled();
    });
  });
});
