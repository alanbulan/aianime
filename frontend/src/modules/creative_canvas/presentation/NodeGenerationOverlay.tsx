// Copyright (c) 2026 AI anime
import { useTranslation } from 'react-i18next';
import { useTaskProgress } from '@/modules/task_execution/public';
import { TaskProgressFeedback } from '@/components/task-progress';
import { Progress } from '@/components/ui/progress';
import { readNodeGenerationTaskKey } from '../application/nodeGenerationTaskState';

export interface NodeGenerationOverlayProps {
  progress?: number | null;
  generation?: unknown;
  startedAt?: number | null;
  rounded?: string;
  messageKey?: string;
}

export function NodeGenerationOverlay({
  progress = null,
  generation,
  startedAt,
  rounded = 'rounded-[var(--node-radius)]',
  messageKey = 'canvas.generationProgress',
}: NodeGenerationOverlayProps) {
  const { t } = useTranslation();
  const taskKey = readNodeGenerationTaskKey(generation);
  const record = generation && typeof generation === 'object' ? generation as Record<string, unknown> : {};
  const generationStartedAt = typeof record.generationStartedAt === 'number' ? record.generationStartedAt : startedAt;
  const displayProgress = useTaskProgress({ status: taskKey ? 'queued' : 'running', progress }, { taskKey, startedAt: generationStartedAt });

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden ${rounded}`}
    >
      <div className="relative flex w-4/5 max-w-52 flex-col items-center gap-2 rounded-lg bg-media/60 px-3 py-3 text-center [container-type:inline-size]">
        <div
          className="flex items-baseline gap-1 leading-none text-media-foreground"
          aria-label={t('taskProgress.estimated', { percent: displayProgress.percent })}
        >
          <span className="text-[10px] font-medium text-media-foreground/80">
            {t('taskProgress.estimatedLabel')}
          </span>
          <span className="text-[clamp(18px,20cqw,34px)] font-semibold tabular-nums tracking-tight">
            {displayProgress.percent}
          </span>
          <span className="text-[15px] font-medium text-media-foreground/70">%</span>
        </div>
        <Progress value={displayProgress.value} active={displayProgress.active} aria-label={t(messageKey)} className="w-full" />
        <TaskProgressFeedback progress={displayProgress} showPercent={false} className="justify-center text-media-foreground/80" />
      </div>
    </div>
  );
}
