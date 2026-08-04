// Copyright (c) 2026 AI anime
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ReferenceDetachButton,
  resolveImageDisplayUrl,
} from '@/modules/creative_canvas/public';
import type { ThreeDWorldReferenceImage } from '@/features/canvas/application/threeDWorldNodeModel';

const PREVIEW_WIDTH = 240;
const PREVIEW_OFFSET = 10;

export function ThreeDWorldReferenceImageThumb({
  item,
  onFocus,
  onDetach,
}: {
  item: ThreeDWorldReferenceImage;
  onFocus(nodeId: string): void;
  onDetach(nodeId: string): void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [previewPosition, setPreviewPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const showPreview = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPreviewPosition({
      left: Math.max(
        8,
        Math.min(
          window.innerWidth - PREVIEW_WIDTH - 8,
          rect.left + rect.width / 2 - PREVIEW_WIDTH / 2,
        ),
      ),
      top: rect.top - PREVIEW_OFFSET,
    });
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onFocus(item.nodeId);
        }}
        onMouseEnter={showPreview}
        onMouseLeave={() => setPreviewPosition(null)}
        className="group nodrag relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-muted transition-colors hover:border-foreground/30"
        title="引用上游图片"
      >
        <img
          src={resolveImageDisplayUrl(item.url)}
          alt="上游图片引用"
          className="h-full w-full object-cover"
        />
        <ReferenceDetachButton nodeId={item.nodeId} onDetach={onDetach} />
      </button>
      {previewPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[400] -translate-y-full"
            style={{
              left: previewPosition.left,
              top: previewPosition.top,
              width: PREVIEW_WIDTH,
            }}
          >
            <div className="overflow-hidden rounded-xl border border-border bg-surface-dark/95 shadow-2xl backdrop-blur-sm">
              <img
                src={resolveImageDisplayUrl(item.url)}
                alt="上游图片引用预览"
                className="block h-auto w-full object-contain"
                draggable={false}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
