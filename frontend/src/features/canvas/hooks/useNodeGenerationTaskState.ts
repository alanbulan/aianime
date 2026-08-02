// Copyright (c) 2026 AI anime
import { useTaskCenterStore } from '@/modules/task_execution/public';
import {
  readNodeGenerationTaskKey,
  resolveNodeGenerationTaskState,
  type NodeGenerationTaskState,
} from '../application/nodeGenerationTaskState';

export function useNodeGenerationTaskState(
  data: unknown,
): NodeGenerationTaskState {
  const taskKey = readNodeGenerationTaskKey(data);
  const task = useTaskCenterStore((state) =>
    taskKey ? state.tasks.get(taskKey) ?? null : null,
  );
  const taskCenterHydrated = useTaskCenterStore((state) => state.isHydrated);

  return resolveNodeGenerationTaskState({
    data,
    task,
    taskCenterHydrated,
    taskKey,
  });
}
