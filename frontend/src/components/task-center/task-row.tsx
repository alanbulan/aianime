// Copyright (c) 2026 AI anime
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import {
  displayLabel,
  taskProgressPercent,
  type TaskState,
} from "@/modules/task_execution/public";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function shortTimestamp(task: TaskState): string {
  // Match the list sort: prefer updated_at, fall back to created_at.
  const raw = task.updated_at || task.created_at;
  if (!raw) return "";
  const d = dayjs(raw);
  if (!d.isValid()) return "";
  return d.isSame(dayjs(), "day") ? d.format("HH:mm") : d.format("MM-DD");
}

const STATUS_ICON: Record<TaskState["status"], string> = {
  submitting: "·",
  queued: "·",
  pending: "·",
  starting: "·",
  running: "⚡",
  completed: "✓",
  failed: "✗",
  cancelled: "×",
};

const STATUS_COLOR: Record<TaskState["status"], string> = {
  submitting: "text-muted-foreground",
  queued: "text-muted-foreground",
  pending: "text-muted-foreground",
  starting: "text-muted-foreground",
  running: "text-primary",
  completed: "text-success",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};

export function TaskRow({
  task,
  selected,
  onClick,
}: {
  task: TaskState;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const label = displayLabel(task, t);
  const progressPercent = taskProgressPercent(task);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full min-h-0 w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted",
        selected && "bg-muted",
      )}
    >
      <span className={cn("w-3 shrink-0 text-center", STATUS_COLOR[task.status])}>
        {STATUS_ICON[task.status]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate">{label}</span>
        {task.current_task ? (
          <span className="truncate text-[10px] text-muted-foreground">
            {task.current_task}
          </span>
        ) : null}
      </span>
      {task.status === "running" && (
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="w-16">
            <Progress value={progressPercent} />
          </div>
          <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {progressPercent}%
          </span>
        </div>
      )}
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
        {shortTimestamp(task)}
      </span>
    </button>
  );
}
