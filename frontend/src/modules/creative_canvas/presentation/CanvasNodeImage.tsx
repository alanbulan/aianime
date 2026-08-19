// Copyright (c) 2026 AI anime
import {
  memo,
  useCallback,
  useEffect,
  useState,
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
  // Keep showing the previous image until the next one has finished loading
  // and decoding. Swapping <img src> directly makes the browser drop the
  // current bitmap immediately, which flashes blank frames when the canvas
  // zoom crosses the preview/original threshold or when React Flow remounts
  // nodes entering the viewport (onlyRenderVisibleElements).
  const [displayedSrc, setDisplayedSrc] = useState(src);

  useEffect(() => {
    if (src === displayedSrc) return;
    if (!src) {
      setDisplayedSrc(src);
      return;
    }
    let cancelled = false;
    const commit = () => {
      if (!cancelled) setDisplayedSrc(src);
    };
    const commitWhenDecoded = () => {
      if (typeof preloader.decode === 'function') {
        void preloader.decode().then(commit, commit);
      } else {
        commit();
      }
    };
    const preloader = new Image();
    preloader.onload = commitWhenDecoded;
    // Failed loads still commit so broken-image behavior matches a plain src.
    preloader.onerror = commit;
    preloader.src = src;
    // Memory-cache hits can complete synchronously before onload is queued.
    if (preloader.complete && preloader.naturalWidth > 0) {
      commitWhenDecoded();
    }
    return () => {
      cancelled = true;
    };
  }, [src, displayedSrc]);

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
      src={displayedSrc}
      // Node images are viewport-sized and usually cached: decoding them
      // synchronously avoids a blank frame between mount and first paint.
      decoding="sync"
      data-viewer-src={
        typeof viewerSourceUrl === 'string' && viewerSourceUrl.trim().length > 0
          ? viewerSourceUrl.trim()
          : undefined
      }
      onDoubleClick={handleDoubleClick}
    />
  );
});
