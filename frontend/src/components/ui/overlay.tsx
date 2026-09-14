// Copyright (c) 2026 AI anime
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Global surfaces use these lanes; z-index inside a surface stays local.
// Children inherit their owner's lane even when React portals move their DOM.
const OVERLAY_LAYERS = { popover: 200, tooltip: 300, modal: 1000, toast: 8000, blocking: 9000, chrome: 10000 };
type OverlayKind = keyof typeof OVERLAY_LAYERS;
const OverlayContext = createContext({ level: 0, container: null as HTMLElement | null });

export function useOverlayContainer(anchor?: Element | null) {
  const { container } = useContext(OverlayContext);
  return anchor?.closest<HTMLElement>("[data-ui-overlay]") ?? container;
}

export function OverlayRoot({ children, kind = "popover", anchor }: {
  children: ReactNode;
  kind?: OverlayKind;
  anchor?: Element | null;
}) {
  const { level: contextLevel } = useContext(OverlayContext);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  // Delegated app tooltips live outside the owner's React subtree.
  const anchorLevel = Number(anchor?.closest("[data-ui-overlay-level]")
    ?.getAttribute("data-ui-overlay-level") ?? 0);
  const parentLevel = Math.max(contextLevel, anchorLevel);
  const level = Math.max(OVERLAY_LAYERS[kind], parentLevel + (kind === "modal" ? 100 : kind === "tooltip" ? 20 : 10));
  return (
    <OverlayContext.Provider value={{ level, container }}>
      <div ref={setContainer} data-ui-overlay={kind} data-ui-overlay-level={level}
        className="pointer-events-none fixed inset-0 isolate" style={{ zIndex: level }}>
        {container && children}
      </div>
    </OverlayContext.Provider>
  );
}

/** Portal for custom surfaces. Base UI primitives use OverlayRoot in their own Portal. */
export function OverlayPortal(props: Parameters<typeof OverlayRoot>[0]) {
  const container = useOverlayContainer(props.anchor);
  return typeof document === "undefined" ? null : createPortal(<OverlayRoot {...props} />, container ?? document.body);
}
