// Copyright (c) 2026 AI anime
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export function overlayCollisionPadding() {
  const titleBarHeight = typeof document === "undefined" ? 0
    : Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--desktop-title-bar-height")) || 0;
  return { top: titleBarHeight + 8, right: 8, bottom: 8, left: 8 };
}

/** Measures the rendered panel, including wrapped options, and follows canvas transforms. */
export function useAnchoredOverlay({ anchor, panel, open, side = "bottom", align = "start", matchWidth = false, maxHeight = Infinity }: {
  anchor: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLElement | null>;
  open: boolean;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  matchWidth?: boolean;
  maxHeight?: number;
}): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const update = () => {
      const trigger = anchor.current;
      const content = panel.current;
      if (!trigger || !content) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 8;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + gap;
      const topEdge = Math.max(viewport?.offsetTop ?? 0, overlayCollisionPadding().top - gap) + gap;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - gap * 2;
      const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - gap;
      const width = Math.min(matchWidth ? rect.width : content.offsetWidth, rightEdge - leftEdge);
      const wantedHeight = Math.min(content.scrollHeight + content.offsetHeight - content.clientHeight, maxHeight);
      const above = Math.max(0, Math.min(bottomEdge - topEdge, rect.top - gap - topEdge));
      const below = Math.max(0, Math.min(bottomEdge - topEdge, bottomEdge - rect.bottom - gap));
      const preferAbove = side === "top";
      const openAbove = preferAbove
        ? above >= wantedHeight || above >= below
        : below < wantedHeight && above > below;
      const availableHeight = Math.min(maxHeight, openAbove ? above : below);
      const height = Math.min(wantedHeight, availableHeight);
      const alignedLeft = align === "center" ? rect.left + (rect.width - width) / 2
        : align === "end" ? rect.right - width : rect.left;
      const next: CSSProperties = {
        position: "fixed",
        left: Math.max(leftEdge, Math.min(alignedLeft, rightEdge - width)),
        top: Math.max(topEdge, Math.min(openAbove ? rect.top - gap - height : rect.bottom + gap, bottomEdge - height)),
        maxWidth: rightEdge - leftEdge,
        maxHeight: availableHeight,
        ...(matchWidth ? { width } : {}),
      };
      setStyle((previous) => Object.keys(next).every((key) => next[key as keyof CSSProperties] === previous[key as keyof CSSProperties]) ? previous : next);
    };
    // Resize/scroll alone do not report React Flow pan/zoom or animated anchors.
    const follow = () => { update(); frame = requestAnimationFrame(follow); };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [anchor, panel, open, side, align, matchWidth, maxHeight]);
  return style;
}
