// Copyright (c) 2026 AI anime
import {
  memo,
  useCallback,
  type ImgHTMLAttributes,
  type MouseEvent,
} from 'react';

import { canvasEventBus } from '../canvasEventComposition';

export interface CanvasNodeImageProps
  extends ImgHTMLAttributes<HTMLImageElement> {
  viewerSourceUrl?: string | null;
  viewerImageList?: Array<string | null | undefined>;
  disableViewer?: boolean;
}

function normalizeViewerList(
  imageList: Array<string | null | undefined> | undefined,
  currentImageUrl: string,
): string[] {
  const deduped: string[] = [];
  for (const rawItem of imageList ?? []) {
    const item = typeof rawItem === 'string' ? rawItem.trim() : '';
    if (!item || deduped.includes(item)) continue;
    deduped.push(item);
  }

  if (!deduped.includes(currentImageUrl)) deduped.unshift(currentImageUrl);
  return deduped.length > 0 ? deduped : [currentImageUrl];
}

export const CanvasNodeImage = memo(function CanvasNodeImage({
  viewerSourceUrl,
  viewerImageList,
  disableViewer = false,
  onDoubleClick,
  src,
  ...props
}: CanvasNodeImageProps) {
  const handleDoubleClick = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
      onDoubleClick?.(event);
      if (event.defaultPrevented || disableViewer) return;

      const fallbackSource =
        event.currentTarget.currentSrc ||
        (typeof src === 'string' ? src : '');
      const imageUrl =
        typeof viewerSourceUrl === 'string' && viewerSourceUrl.trim().length > 0
          ? viewerSourceUrl.trim()
          : fallbackSource.trim();
      if (!imageUrl) return;

      event.stopPropagation();
      canvasEventBus.publish('image-viewer/open', {
        imageUrl,
        imageList: normalizeViewerList(viewerImageList, imageUrl),
      });
    },
    [disableViewer, onDoubleClick, src, viewerImageList, viewerSourceUrl],
  );

  return (
    <img
      draggable={false}
      {...props}
      src={src}
      data-viewer-src={
        typeof viewerSourceUrl === 'string' && viewerSourceUrl.trim().length > 0
          ? viewerSourceUrl.trim()
          : undefined
      }
      onDoubleClick={handleDoubleClick}
    />
  );
});
