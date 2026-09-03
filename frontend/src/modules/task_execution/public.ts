// Copyright (c) 2026 AI anime
export {
  TaskCenterProvider,
  useCancelTask,
  useClearCompleted,
  useDeleteTask,
  useTasks,
} from "@/modules/task_execution/composition";
export {
  ageMs,
  displayLabel,
  isActive,
  isTerminal,
  taskProgressPercent,
  taskProgressRatio,
} from "@/modules/task_execution/domain/taskState";
export type {
  StreamHealth,
  TaskEvent,
  TaskEventListener,
  TaskEventType,
  TaskState,
  TaskStatus,
  TaskStreamEvent,
} from "@/modules/task_execution/domain/contracts";
export {
  createTaskEventBus,
} from "@/modules/task_execution/application/taskEventBus";
export type {
  TaskEventBus,
} from "@/modules/task_execution/application/taskEventBus";
export {
  TaskEventBusContext,
  useTaskEventBus,
} from "@/modules/task_execution/presentation/taskEventBusContext";
export {
  taskOriginLink,
} from "@/modules/task_execution/presentation/taskOriginLink";
export type {
  TaskOriginLink,
} from "@/modules/task_execution/presentation/taskOriginLink";
export {
  TaskControllerProvider,
  claimOwnership,
  releaseOwnership,
  serializeKey,
  useEntrySnapshot,
  useInstanceId,
  useTaskRegistry,
} from "@/modules/task_execution/presentation/task-controller-provider";
export type {
  TaskControllerSnapshot,
  TaskKey,
  TaskRegistryEntry,
  TaskStreamState,
} from "@/modules/task_execution/presentation/task-controller-provider";
export { useTaskController } from "@/modules/task_execution/presentation/useTaskController";
export type {
  TaskControllerHandle,
  UseTaskControllerOptions,
} from "@/modules/task_execution/presentation/useTaskController";
export { useStageTask } from "@/modules/task_execution/presentation/useStageTask";
export { useScopedTaskBatchInvalidation } from "@/modules/task_execution/presentation/useScopedTaskBatchInvalidation";
export { useTaskStream } from "@/modules/task_execution/presentation/useTaskStream";
export { useEpisodeImageTaskInvalidation } from "@/modules/task_execution/presentation/useEpisodeImageTaskInvalidation";
export {
  TaskCompletionError,
  awaitTaskCompletion,
  listTasks,
} from "@/modules/task_execution/infrastructure/taskCompletionMonitor";
export type {
  TaskCompletionFailureStatus,
} from "@/modules/task_execution/infrastructure/taskCompletionMonitor";
export {
  selectCountByStatus,
  selectFilteredTasks,
  selectLastCompletion,
  selectLeadingRunning,
  selectRunningTasks,
  selectTerminalTasks,
  useTaskCenterStore,
} from "@/modules/task_execution/presentation/taskCenterStore";
export type {
  Filter,
  Filter as TaskCenterFilter,
  TaskCenterState,
} from "@/modules/task_execution/presentation/taskCenterStore";
export {
  taskErrorMessage,
} from "@/modules/task_execution/presentation/taskErrorMessage";
export {
  useTaskSubscribe,
} from "@/modules/task_execution/presentation/useTaskSubscribe";
export type {
  UseTaskSubscribeOptions,
} from "@/modules/task_execution/presentation/useTaskSubscribe";
export type {
  TaskDeleteTarget,
  TaskQueryGateway,
  TaskTarget,
} from "@/modules/task_execution/application/taskQueryPorts";
export type {
  UseTasksFilter,
} from "@/modules/task_execution/presentation/taskQueryHooks";
export type {
  TaskCenterProviderProps,
} from "@/modules/task_execution/presentation/TaskCenterProvider";
export {
  isActiveStatus,
  isScopedTask,
  SCOPED_TASK_TYPES,
  TASK_TYPES,
} from "@/modules/task_execution/domain/taskTypes";
export type {
  TaskType,
} from "@/modules/task_execution/domain/taskTypes";
export {
  propReferenceAssetScope,
  sceneReferenceAssetScope,
  selectionScope,
  stageAssetScope,
  taskConfigScope,
} from "@/modules/task_execution/domain/taskScope";
export {
  episodeRouteSegmentForTaskType,
  TASK_EPISODE_STAGES,
} from "@/modules/task_execution/domain/taskOrigin";
export type {
  TaskEpisodeRouteSegment,
  TaskEpisodeStageDefinition,
  TaskEpisodeStageId,
} from "@/modules/task_execution/domain/taskOrigin";
