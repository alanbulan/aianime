// Copyright (c) 2026 AI anime
import { Map } from 'lucide-react';

export interface CanvasMinimapButtonStyles {
  button: string;
  activeButton: string;
}

export interface CanvasMinimapButtonProps {
  pinned: boolean;
  onTogglePin: () => void;
  onHoverChange: (hovered: boolean) => void;
  placement?: 'bottom-right' | 'top-right';
  styles: CanvasMinimapButtonStyles;
}

export function CanvasMinimapButton({
  pinned,
  onTogglePin,
  onHoverChange,
  placement = 'bottom-right',
  styles,
}: CanvasMinimapButtonProps) {
  const isTop = placement === 'top-right';
  return (
    <div
      className={`nopan nowheel pointer-events-auto group absolute right-3 z-30 ${
        isTop ? 'top-3' : 'bottom-3'
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <button
        type="button"
        onClick={onTogglePin}
        className={`${styles.button} ${
          pinned
            ? styles.activeButton
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
        aria-label="画布缩略图"
        aria-pressed={pinned}
      >
        <Map className="h-3.5 w-3.5" />
      </button>
      <span
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] text-popover-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 ${
          isTop ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
        }`}
      >
        画布缩略图
      </span>
    </div>
  );
}
