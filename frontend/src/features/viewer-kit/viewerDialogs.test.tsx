// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PanoCaptureDialog, ThreeDDirectorDialog } from "./viewerDialogs";

const loaded = vi.hoisted(() => ({ pano: vi.fn(), world: vi.fn() }));
vi.mock("./pano/PanoCaptureDialog", () => {
  loaded.pano();
  return { PanoCaptureDialog: () => <div>全景已加载</div> };
});
vi.mock("./three-d/ThreeDDirectorDialog", () => {
  loaded.world();
  return { ThreeDDirectorDialog: () => <div>3D 已加载</div> };
});

it("loads each viewer only when opened and removes it on close", async () => {
  const props = { onOpenChange: vi.fn(), manifest: null, onCapture: vi.fn() };
  const { rerender } = render(<>
    <PanoCaptureDialog {...props} open={false} />
    <ThreeDDirectorDialog {...props} open={false} />
  </>);
  expect(loaded.pano).not.toHaveBeenCalled();
  expect(loaded.world).not.toHaveBeenCalled();
  rerender(<PanoCaptureDialog {...props} open />);
  expect(await screen.findByText("全景已加载")).toBeInTheDocument();
  expect(loaded.world).not.toHaveBeenCalled();
  rerender(<ThreeDDirectorDialog {...props} open />);
  expect(await screen.findByText("3D 已加载")).toBeInTheDocument();
  rerender(<ThreeDDirectorDialog {...props} open={false} />);
  expect(screen.queryByText("3D 已加载")).not.toBeInTheDocument();
});
