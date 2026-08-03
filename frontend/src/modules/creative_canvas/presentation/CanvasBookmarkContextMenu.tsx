// Copyright (c) 2026 AI anime
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { bookmarkIndexToDigit } from '@/modules/creative_canvas/domain/viewportBookmarks';
import { MOD_KEY_LABEL } from '@/lib/platform';

export interface CanvasBookmarkContextMenuProps {
  index: number;
  filled: boolean;
  position: { x: number; y: number };
  onSetCurrent: () => void;
  onDelete: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function CanvasBookmarkContextMenu({
  index,
  filled,
  position,
  onSetCurrent,
  onDelete,
  onClearAll,
  onClose,
}: CanvasBookmarkContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const digit = bookmarkIndexToDigit(index) ?? '';
  const [coordinates, setCoordinates] = useState(position);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 8;
    let left = position.x;
    let top = position.y;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - rect.width);
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - rect.height);
    }
    setCoordinates({ x: left, y: top });
  }, [position.x, position.y]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-[10010] min-w-[220px] rounded-lg border border-border bg-popover py-1 text-sm text-popover-foreground shadow-xl"
      style={{ left: coordinates.x, top: coordinates.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuRow
        label={t(
          filled
            ? 'canvas.bookmarks.setCurrent'
            : 'canvas.bookmarks.setNew',
        )}
        shortcut={`${MOD_KEY_LABEL} ${digit}`}
        onClick={() => run(onSetCurrent)}
      />
      {filled ? (
        <MenuRow
          label={t('canvas.bookmarks.deleteCurrent')}
          onClick={() => run(onDelete)}
        />
      ) : null}
      <MenuRow
        label={t('canvas.bookmarks.clearAll')}
        shortcut={`${MOD_KEY_LABEL} ⇧ E`}
        onClick={() => run(onClearAll)}
      />
    </div>
  );
}

function MenuRow({
  label,
  shortcut,
  onClick,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-muted"
    >
      <span>{label}</span>
      {shortcut ? (
        <span className="text-xs text-muted-foreground">{shortcut}</span>
      ) : null}
    </button>
  );
}
