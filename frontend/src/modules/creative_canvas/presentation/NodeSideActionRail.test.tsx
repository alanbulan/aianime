// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeSideActionRail } from "./NodeSideActionRail";

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  useStore: (selector: (state: { nodeLookup: Map<string, unknown> }) => unknown) =>
    selector({
      nodeLookup: new Map([
        ["node-1", { internals: { z: 4 } }],
      ]),
    }),
  NodeToolbar: ({
    children,
    isVisible,
    style,
  }: {
    children: React.ReactNode;
    isVisible: boolean;
    style: React.CSSProperties;
  }) => (
    <div data-testid="toolbar" data-visible={String(isVisible)} style={style}>
      {children}
    </div>
  ),
}));

describe("NodeSideActionRail", () => {
  it("projects injected hover and local rail hover without reading Canvas state", () => {
    const { rerender } = render(
      <NodeSideActionRail nodeId="node-1" autoHide>
        action
      </NodeSideActionRail>,
    );

    const toolbar = screen.getByTestId("toolbar");
    expect(toolbar).toHaveAttribute("data-visible", "false");
    expect(toolbar).toHaveStyle({ zIndex: "6" });

    rerender(
      <NodeSideActionRail nodeId="node-1" autoHide nodeHovered>
        action
      </NodeSideActionRail>,
    );
    expect(toolbar).toHaveAttribute("data-visible", "true");

    rerender(
      <NodeSideActionRail nodeId="node-1" autoHide>
        action
      </NodeSideActionRail>,
    );
    const hoverSurface = screen.getByText("action").parentElement?.parentElement;
    expect(hoverSurface).not.toBeNull();
    fireEvent.mouseEnter(hoverSurface!);
    expect(toolbar).toHaveAttribute("data-visible", "true");
    fireEvent.mouseLeave(hoverSurface!);
    expect(toolbar).toHaveAttribute("data-visible", "false");
  });

  it("keeps non-auto-hidden rails visible", () => {
    render(
      <NodeSideActionRail nodeId="node-1">
        action
      </NodeSideActionRail>,
    );
    expect(screen.getByTestId("toolbar")).toHaveAttribute(
      "data-visible",
      "true",
    );
  });
});
