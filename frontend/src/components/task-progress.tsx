// Copyright (c) 2026 AI anime
import { useTranslation } from 'react-i18next';
import { useTaskProgress, type TaskProgressOptions, type TaskProgressSource, type TaskProgressView } from '@/modules/task_execution/public';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export function TaskProgressFeedback({ progress, className, showPercent = true, compact = false }: {
  progress: TaskProgressView;
  className?: string;
  showPercent?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span aria-live="off" className={cn('flex min-w-0 flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground tabular-nums', compact && 'leading-3', className)}>
      {showPercent && <span>{progress.active ? t('taskProgress.estimated', { percent: progress.percent }) : `${progress.percent}%`}</span>}
      {progress.active && <span title={t('taskProgress.elapsed', { time: progress.elapsed })}>{compact ? progress.elapsed : t('taskProgress.elapsed', { time: progress.elapsed })}</span>}
      {progress.reconnecting && <span role="status">{t('taskProgress.reconnecting')}</span>}
      {!compact && progress.active && !progress.reconnecting && progress.value >= 93 && <span>{t('taskProgress.processing')}</span>}
    </span>
  );
}

export function TaskProgress({ task, className, barClassName, compact = false, 'aria-label': ariaLabel, ...options }: TaskProgressOptions & {
  task: TaskProgressSource;
  className?: string;
  barClassName?: string;
  'aria-label'?: string;
  compact?: boolean;
}) {
  const progress = useTaskProgress(task, options);
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <TaskProgressFeedback progress={progress} compact={compact} />
      <Progress value={progress.value} active={progress.active} aria-label={ariaLabel} className={barClassName} />
    </div>
  );
}
