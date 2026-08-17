// Copyright (c) 2026 AI anime
import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface NodeGenerationOverlayProps {
  progress?: number | null;
  rounded?: string;
  messageKey?: string;
}

export function NodeGenerationOverlay({
  progress = null,
  rounded = 'rounded-[var(--node-radius)]',
  messageKey = 'canvas.generationProgress',
}: NodeGenerationOverlayProps) {
  const { t } = useTranslation();
  const percent =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.round(Math.max(0, Math.min(1, progress)) * 100)
      : null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden ${rounded}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-label={t(messageKey)}
    >
      <div className="relative flex flex-col items-center text-center">
        {percent == null ? (
          <LoaderCircle className="h-8 w-8 animate-spin text-media-foreground" />
        ) : (
          <div className="flex items-baseline leading-none text-media-foreground">
            <span className="text-[34px] font-semibold tabular-nums tracking-tight">
              {percent}
            </span>
            <span className="ml-1 text-[15px] font-medium text-media-foreground/70">%</span>
          </div>
        )}
      </div>
    </div>
  );
}
