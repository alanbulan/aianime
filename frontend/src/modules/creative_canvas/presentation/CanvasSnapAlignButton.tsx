// Copyright (c) 2026 AI anime
import { Magnet } from 'lucide-react';

import { useSnapAlignStore } from './snapAlignStore';

export interface CanvasSnapAlignButtonStyles {
  button: string;
  activeButton: string;
}

export interface CanvasSnapAlignButtonProps {
  placement?: 'bottom-right' | 'top-right';
  styles: CanvasSnapAlignButtonStyles;
}

export function CanvasSnapAlignButton({
  placement = 'bottom-right',
  styles,
}: CanvasSnapAlignButtonProps) {
  const enabled = useSnapAlignStore((state) => state.enabled);
  const toggle = useSnapAlignStore((state) => state.toggle);
  const isTop = placement === 'top-right';
  return (
    <div
      className={`nopan nowheel pointer-events-auto group absolute right-12 z-30 ${
        isTop ? 'top-3' : 'bottom-3'
      }`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={toggle}
        className={`${styles.button} ${
          enabled
            ? styles.activeButton
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
        aria-pressed={enabled}
        aria-label={enabled ? '关闭对齐吸附' : '开启对齐吸附'}
      >
        <Magnet className="h-3.5 w-3.5" />
      </button>
      <span
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] text-popover-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 ${
          isTop ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
        }`}
      >
        {enabled ? '关闭对齐吸附' : '开启对齐吸附'}
      </span>
    </div>
  );
}
