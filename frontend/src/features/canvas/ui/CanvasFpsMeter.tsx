// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';

import {
  CANVAS_CONTROL_GLASS_CLASS,
  CANVAS_CONTROL_ICON_BUTTON_ACTIVE_CLASS,
  CANVAS_CONTROL_ICON_BUTTON_CLASS,
} from './canvasControlStyles';

/**
 * 画布右上角的 FPS 计量器:点击按钮开启后,用 requestAnimationFrame 实时统计帧率
 * 并显示;关闭时停止 rAF 循环,不产生任何开销。帧率按区间着色(绿/黄/红),便于
 * 排查画布卡顿。
 */
export function CanvasFpsMeter() {
  const [enabled, setEnabled] = useState(false);
  const [fps, setFps] = useState<number | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setFps(null);
      return;
    }
    let frames = 0;
    let windowStart = performance.now();
    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - windowStart;
      // 每 ~500ms 结算一次,兼顾刷新及时与读数稳定。
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        windowStart = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  const fpsColor =
    fps == null
      ? 'text-text-muted'
      : fps >= 50
        ? 'text-emerald-700 dark:text-emerald-300'
        : fps >= 30
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-red-700 dark:text-red-300';

  return (
    <div
      className="nopan nowheel pointer-events-auto group absolute right-3 top-3 z-30 flex items-center gap-1.5"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {enabled && (
        <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${CANVAS_CONTROL_GLASS_CLASS}`}>
          <span className={fpsColor}>{fps ?? '--'}</span>
          <span className="text-text-muted">FPS</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => setEnabled((value) => !value)}
        className={`${CANVAS_CONTROL_ICON_BUTTON_CLASS} ${
          enabled
            ? CANVAS_CONTROL_ICON_BUTTON_ACTIVE_CLASS
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
        aria-pressed={enabled}
        aria-label={enabled ? '关闭 FPS 显示' : '开启 FPS 显示'}
      >
        <Activity className="h-3.5 w-3.5" />
      </button>
      <span className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] text-popover-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100">
        {enabled ? '关闭 FPS 显示' : '开启 FPS 显示'}
      </span>
    </div>
  );
}
