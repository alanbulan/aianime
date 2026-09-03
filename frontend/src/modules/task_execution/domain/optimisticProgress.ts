// Copyright (c) 2026 AI anime
import type { StreamHealth, TaskStatus } from './contracts';

export interface TaskProgressSource {
  task_id?: string;
  task_key?: string;
  status: TaskStatus | 'idle' | 'finalizing';
  progress?: number | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  streamHealth?: StreamHealth;
}

export type ProgressPhase = 'idle' | 'queued' | 'running' | 'finalizing' | 'completed' | 'failed' | 'cancelled';

export interface ProgressSnapshot {
  id: string;
  phase: ProgressPhase;
  value: number;
  startedAt: number;
  phaseStartedAt: number;
  pausedMs: number;
  disconnectedAt: number | null;
  endedAt: number | null;
  observedAt: number;
}

export function progressPhase(status: TaskProgressSource['status']): ProgressPhase {
  if (status === 'submitting' || status === 'pending' || status === 'starting' || status === 'queued') return 'queued';
  return status;
}

export function isProgressActive(phase: ProgressPhase): boolean {
  return phase === 'queued' || phase === 'running' || phase === 'finalizing';
}

export function progressTimestamp(value: string | number | null | undefined): number | null {
  const timestamp = typeof value === 'number' ? value : value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

const easeOut = (value: number) => 1 - (1 - Math.min(1, Math.max(0, value))) ** 3;

/** Display-only estimate. It never determines task completion or replaces server progress. */
export function estimatedProgress(phase: ProgressPhase, elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs / 1000);
  if (phase === 'queued') return 1 + 7 * (1 - Math.exp(-seconds / 60));
  if (phase === 'finalizing') return 93 + 6.2 * (1 - Math.exp(-seconds / 45));
  if (phase !== 'running') return 0;
  if (seconds <= 300) return 8 + 67 * easeOut(seconds / 300);
  if (seconds <= 1200) return 75 + 18 * easeOut((seconds - 300) / 900);
  return 93 + 5.7 * (1 - Math.exp(-(seconds - 1200) / 1200));
}

export function advanceProgress(
  previous: ProgressSnapshot | null,
  input: { id: string; task: TaskProgressSource; startedAt?: number | null; connected: boolean },
  now: number,
): ProgressSnapshot {
  const phase = progressPhase(input.task.status);
  const active = isProgressActive(phase);
  const sameRun = previous?.id === input.id;
  const previousRun = sameRun ? previous : null;
  const startedAt = progressTimestamp(input.task.created_at) ?? input.startedAt ?? previousRun?.startedAt ?? now;
  const phaseChanged = previousRun && previousRun.phase !== phase;
  const phaseStartedAt = phaseChanged ? now : previousRun?.phaseStartedAt ?? startedAt;
  let pausedMs = phaseChanged ? 0 : previousRun?.pausedMs ?? 0;
  let disconnectedAt = phaseChanged ? null : previousRun?.disconnectedAt ?? null;
  if (!input.connected && active && disconnectedAt === null) disconnectedAt = now;
  if (input.connected && disconnectedAt !== null) {
    pausedMs += Math.max(0, now - disconnectedAt);
    disconnectedAt = null;
  }
  const realProgress = Number.isFinite(input.task.progress) ? Math.max(0, Math.min(99.2, (input.task.progress ?? 0) * 100)) : 0;
  let value = previousRun?.value ?? realProgress;
  if (phase === 'completed') value = 100;
  else if (phase === 'idle') value = 0;
  else if (active && input.connected) {
    const cap = phase === 'queued' ? 8 : phase === 'finalizing' ? 99.2 : 98.7;
    const driftSeconds = previousRun && previousRun.disconnectedAt === null ? Math.max(0, now - previousRun.observedAt) / 1000 : 0;
    const timeConstant = phase === 'queued' ? 60 : phase === 'finalizing' ? 45 : value < 75 ? 300 : value < 93 ? 900 : 1200;
    const drift = value + Math.max(0, cap - value) * (1 - Math.exp(-driftSeconds / timeConstant));
    value = Math.min(99.2, Math.max(value, drift, realProgress, estimatedProgress(phase, now - phaseStartedAt - pausedMs)));
  }
  const endedAt = active || phase === 'idle'
    ? null
    : previousRun?.endedAt ?? progressTimestamp(input.task.completed_at || input.task.updated_at) ?? now;
  return { id: input.id, phase, value, startedAt, phaseStartedAt, pausedMs, disconnectedAt, endedAt, observedAt: now };
}
