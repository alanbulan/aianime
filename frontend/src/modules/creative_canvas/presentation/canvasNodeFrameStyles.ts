// Copyright (c) 2026 AI anime
interface CanvasNodeFrameOptions {
  selected?: boolean;
  mainline?: boolean;
  dashed?: boolean;
}

export const CANVAS_NODE_PANEL_SURFACE_CLASS = 'bg-card/95';
export const CANVAS_NODE_INPUT_SURFACE_CLASS = 'bg-muted';
export const CANVAS_NODE_INPUT_BODY_FRAME_CLASS =
  'border-border shadow-md hover:border-foreground/20 focus-within:border-primary/45';
export const CANVAS_NODE_INPUT_FRAME_CLASS =
  'border-border shadow-lg hover:border-foreground/18 focus-within:border-primary/40';
export const CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS =
  'border-primary/45 shadow-lg';
export const CANVAS_NODE_INPUT_PLACEHOLDER_CLASS =
  'canvas-node-input-placeholder placeholder:text-[var(--canvas-node-input-placeholder)]';
export const CANVAS_NODE_OPS_PANEL_CLASS =
  `border ${CANVAS_NODE_INPUT_SURFACE_CLASS} ${CANVAS_NODE_INPUT_FRAME_CLASS}`;
export const CANVAS_NODE_TOOLBAR_SURFACE_CLASS = CANVAS_NODE_OPS_PANEL_CLASS;
export const CANVAS_NODE_TOOLBAR_PILL_CLASS =
  `rounded-full ${CANVAS_NODE_TOOLBAR_SURFACE_CLASS} p-1.5`;
export const CANVAS_NODE_TOOLBAR_CARD_CLASS =
  `rounded-2xl ${CANVAS_NODE_TOOLBAR_SURFACE_CLASS}`;
export const NODE_OPS_PANEL_ENTER_CLASS =
  "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200 ease-out motion-reduce:animate-none";

export function canvasNodeFrameClass({
  selected = false,
  mainline = false,
  dashed = false,
}: CanvasNodeFrameOptions): string {
  const borderStyle = dashed ? 'border-dashed' : 'border-solid';
  const transition = 'transition-colors duration-200 ease-out';
  if (selected) {
    return `${borderStyle} ${transition} border-primary/55`;
  }
  return mainline
    ? `${borderStyle} ${transition} border-foreground/20 hover:border-foreground/32`
    : `${borderStyle} ${transition} border-border hover:border-foreground/24`;
}
