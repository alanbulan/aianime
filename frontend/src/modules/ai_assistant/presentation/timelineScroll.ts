// Copyright (c) 2026 AI anime

export const TIMELINE_ACTIVE_VIEWPORT_RATIO = 1 / 3;

export function calculateTimelineTurnScrollTop({
  itemStart,
  viewportHeight,
  totalSize,
}: {
  itemStart: number;
  viewportHeight: number;
  totalSize: number;
}) {
  const desiredScrollTop = itemStart
    - viewportHeight * TIMELINE_ACTIVE_VIEWPORT_RATIO;
  const maxScrollTop = Math.max(0, totalSize - viewportHeight);
  return Math.min(maxScrollTop, Math.max(0, desiredScrollTop));
}

export function calculateTimelineContextDelta({
  viewportHeight,
  nodeCenter,
  scrollTop,
  scrollHeight,
}: {
  viewportHeight: number;
  nodeCenter: number;
  scrollTop: number;
  scrollHeight: number;
}) {
  const edgeInset = Math.min(96, Math.max(48, viewportHeight * 0.22));
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  if (scrollTop > 1 && nodeCenter < edgeInset) return nodeCenter - edgeInset;
  if (scrollTop < maxScrollTop - 1 && nodeCenter > viewportHeight - edgeInset) {
    return nodeCenter - (viewportHeight - edgeInset);
  }
  return 0;
}
