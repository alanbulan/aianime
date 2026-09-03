// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from 'react';
import { advanceProgress, isProgressActive, progressPhase, progressTimestamp, type ProgressSnapshot, type TaskProgressSource } from '../domain/optimisticProgress';
import { useTaskCenterStore } from './taskCenterStore';

export interface TaskProgressOptions {
  taskKey?: string | null;
  startedAt?: number | string | null;
  /** Local installs/downloads have their own lifecycle, independent of project SSE. */
  local?: boolean;
}

export interface TaskProgressView {
  value: number;
  percent: string;
  active: boolean;
  reconnecting: boolean;
  elapsed: string;
  phase: ProgressSnapshot['phase'];
}

export function useTaskProgress(source: TaskProgressSource, options: TaskProgressOptions = {}): TaskProgressView {
  const taskKey = options.taskKey ?? source.task_key;
  const registeredTask = useTaskCenterStore((state) => taskKey ? state.tasks.get(taskKey) : undefined);
  const health = useTaskCenterStore((state) => state.streamHealth);
  const lastEventAt = useTaskCenterStore((state) => state.lastEventAt);
  const task: TaskProgressSource = source.task_id ? source : registeredTask ?? source;
  const snapshot = useRef<ProgressSnapshot | null>(null);
  const [lastTick, setNow] = useState(Date.now);
  const now = Math.max(lastTick, Date.now());
  const active = isProgressActive(progressPhase(task.status));
  const startedAt = progressTimestamp(options.startedAt);
  const id = taskKey && startedAt !== null
    ? `${taskKey}:${startedAt}`
    : task.task_id || `${taskKey ?? 'local'}:${task.created_at ?? startedAt ?? ''}`;

  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active, id]);

  const monitorsConnection = !options.local && Boolean(taskKey || task.task_id);
  const interrupted = (streamHealth: typeof health | undefined) =>
    streamHealth === 'connecting' || streamHealth === 'reconnecting' || streamHealth === 'failed';
  const reconnecting = active && monitorsConnection && (
    interrupted(task.streamHealth) || interrupted(health) ||
    (health === 'polling' && (lastEventAt === null || now - lastEventAt > 45_000))
  );
  snapshot.current = advanceProgress(snapshot.current, { id, task, startedAt, connected: !reconnecting }, now);
  const current = snapshot.current;
  const elapsedSeconds = Math.max(0, Math.floor(((current.endedAt ?? now) - current.startedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  return {
    value: current.value,
    percent: current.phase === 'completed' ? '100' : (Math.floor(current.value * 10) / 10).toFixed(1),
    active,
    reconnecting,
    elapsed: `${minutes}:${seconds}`,
    phase: current.phase,
  };
}
