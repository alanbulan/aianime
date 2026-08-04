// Copyright (c) 2026 AI anime
import type { CSSProperties, ReactNode } from 'react';

export interface ZoomScaledToolbarProps {
  children: ReactNode;
  /** 缩放锚点。 */
  origin?: CSSProperties['transformOrigin'];
  /** 跟随缩放模式下的缩放下限。 */
  min?: number;
  /** `follow` 跟随画布，`counter` 反向补偿画布缩放。 */
  mode?: 'follow' | 'counter';
  /** counter 模式下的缩放下限。 */
  counterMin?: number;
  /** counter 模式下的缩放上限。 */
  counterMax?: number;
}

export function ZoomScaledToolbar({
  children,
  origin = 'bottom center',
  min,
  mode = 'follow',
  counterMin = 0.7,
  counterMax = 1.6,
}: ZoomScaledToolbarProps) {
  const scale =
    mode === 'counter'
      ? `clamp(${counterMin}, calc(1 / var(--ai-anime-canvas-zoom, 1)), ${counterMax})`
      : min !== undefined
        ? `max(${min}, var(--ai-anime-canvas-zoom, 1))`
        : 'var(--ai-anime-canvas-zoom, 1)';
  return (
    <div style={{ transform: `scale(${scale})`, transformOrigin: origin }}>
      {children}
    </div>
  );
}
