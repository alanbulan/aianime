// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from 'react';

export interface NodeGenerationOverlayProps {
  progress?: number | null;
  startedAt?: number | null;
  durationMs?: number;
  /** @deprecated 仅保留兼容旧调用，加载态不再绘制背景遮罩。 */
  hasBackground?: boolean;
  rounded?: string;
  messageKey?: string;
}

const DEFAULT_DURATION_MS = 60000;

export function NodeGenerationOverlay({
  progress = null,
  startedAt = null,
  durationMs = DEFAULT_DURATION_MS,
  hasBackground: _hasBackground = false,
  rounded = 'rounded-[var(--node-radius)]',
  messageKey: _messageKey = 'canvas.generationProgress',
}: NodeGenerationOverlayProps) {
  const [now, setNow] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 120);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const percent = useMemo(() => {
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      return Math.round(Math.max(0, Math.min(1, progress)) * 100);
    }
    const begin = typeof startedAt === 'number' ? startedAt : mountedAt;
    const duration = Math.max(1000, durationMs);
    const elapsed = Math.max(0, now - begin);
    const estimatedProgress = Math.min(elapsed / duration, 0.96);
    return Math.round(estimatedProgress * 100);
  }, [durationMs, mountedAt, now, progress, startedAt]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden ${rounded}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="relative flex flex-col items-center text-center">
        <div className="flex items-baseline leading-none text-media-foreground">
          <span className="text-[34px] font-semibold tabular-nums tracking-tight">
            {percent}
          </span>
          <span className="ml-1 text-[15px] font-medium text-media-foreground/70">%</span>
        </div>
      </div>
    </div>
  );
}
