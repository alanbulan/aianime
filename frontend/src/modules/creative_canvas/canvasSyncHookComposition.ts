// Copyright (c) 2026 AI anime
import type {
  CanvasProjectionEdge,
  CanvasProjectionNode,
} from "./application/canvasProjectionGraph";
import type {
  CanvasHydrationEdge,
  CanvasHydrationNode,
} from "./application/canvasSyncHydration";
import type {
  CanvasSyncHistoryState,
  CanvasSyncViewport,
} from "./application/canvasSyncStorage";
import { useCanvasConflictController } from "./canvasConflictRecoveryComposition";
import { useCanvasDraftPersistenceController } from "./canvasDraftPersistenceComposition";
import { createCanvasHydrationLifecycleHook } from "./canvasHydrationComposition";
import {
  useCanvasHistoryPersistence,
  useCanvasViewportPersistence,
} from "./canvasLocalPersistenceComposition";
import { useCanvasPresetRefreshController } from "./canvasPresetRefreshComposition";
import { createCanvasRuntimeBridgeHook } from "./canvasRuntimeBridgeComposition";
import { createCanvasSaveControllerHook } from "./canvasSaveControllerComposition";
import { getFreezoneCanvas } from "./canvasStorageComposition";
import type { CanvasMutationState } from "./domain/canvasMutation";
import type { CanvasDraftPersistenceState } from "./presentation/useCanvasDraftPersistenceController";
import type { CanvasHydrationLifecycleState } from "./presentation/useCanvasHydrationLifecycle";
import type { CanvasLocalPersistenceState } from "./presentation/useCanvasLocalPersistence";
import type { CanvasRuntimeBridgeState } from "./presentation/useCanvasRuntimeBridge";
import type { CanvasSaveControllerState } from "./presentation/useCanvasSaveController";
import {
  type CanvasSyncHookDependencies,
  createUseCanvasSync,
} from "./presentation/useCanvasSync";

export interface CanvasSyncStoreState<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
> extends CanvasMutationState {
  nodes: TNode[];
  edges: TEdge[];
  currentViewport: CanvasSyncViewport;
  viewportBookmarks: unknown;
  history: CanvasSyncHistoryState<TNode, TEdge>;
  setCanvasData(
    nodes: TNode[],
    edges: TEdge[],
    history?: CanvasSyncHistoryState<TNode, TEdge>,
  ): void;
  applyCanvasDataEdit(nodes: TNode[], edges: TEdge[]): void;
  hydrateCanvasDraft(draft: {
    nodes: TNode[];
    edges: TEdge[];
    history?: CanvasSyncHistoryState<TNode, TEdge> | null;
    mutation: CanvasMutationState;
  }): void;
  restoreHistory(history: CanvasSyncHistoryState<TNode, TEdge>): void;
  setViewportState(viewport: CanvasSyncViewport): void;
  hydrateViewportBookmarks(list: unknown): void;
  acknowledgePendingClear(): void;
}

export interface CanvasSyncHookCompositionOptions<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
> {
  useCanvasState<TResult>(
    selector: (state: CanvasSyncStoreState<TNode, TEdge>) => TResult,
  ): TResult;
  readCanvasState(): CanvasSyncStoreState<TNode, TEdge>;
  subscribeCanvasState(
    listener: (
      state: CanvasSyncStoreState<TNode, TEdge>,
      previous: CanvasSyncStoreState<TNode, TEdge>,
    ) => void,
  ): () => void;
  useViewportPort(): {
    setViewport(
      viewport: CanvasSyncViewport,
      options: { duration: number },
    ): unknown;
  };
}

function localPersistenceState<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
>(state: CanvasSyncStoreState<TNode, TEdge>): CanvasLocalPersistenceState {
  return {
    nodes: state.nodes,
    edges: state.edges,
    history: state.history,
    userEditsSinceHydrate: state.userEditsSinceHydrate,
    currentViewport: state.currentViewport,
  };
}

function draftPersistenceState<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
>(
  state: CanvasSyncStoreState<TNode, TEdge>,
): CanvasDraftPersistenceState<TNode, TEdge> {
  return {
    nodes: state.nodes,
    edges: state.edges,
    currentViewport: state.currentViewport,
    history: state.history,
    userEditsSinceHydrate: state.userEditsSinceHydrate,
    lastMutationSource: state.lastMutationSource,
    pendingClearIntent: state.pendingClearIntent,
  };
}

function saveControllerState<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
>(
  state: CanvasSyncStoreState<TNode, TEdge>,
): CanvasSaveControllerState<TNode, TEdge> {
  return {
    nodes: state.nodes,
    edges: state.edges,
    currentViewport: state.currentViewport,
    viewportBookmarks: state.viewportBookmarks,
    userEditsSinceHydrate: state.userEditsSinceHydrate,
    lastMutationSource: state.lastMutationSource,
    pendingClearIntent: state.pendingClearIntent,
  };
}

function hydrationLifecycleState<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
>(
  state: CanvasSyncStoreState<TNode, TEdge>,
): CanvasHydrationLifecycleState<TNode, TEdge> {
  return {
    nodes: state.nodes,
    edges: state.edges,
    userEditsSinceHydrate: state.userEditsSinceHydrate,
    hydrateViewportBookmarks: state.hydrateViewportBookmarks,
  };
}

function runtimeBridgeState<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
>(
  state: CanvasSyncStoreState<TNode, TEdge>,
): CanvasRuntimeBridgeState<TNode, TEdge> {
  return {
    nodes: state.nodes,
    edges: state.edges,
    hydrateViewportBookmarks: state.hydrateViewportBookmarks,
  };
}

export function createCanvasSyncHook<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
>(options: CanvasSyncHookCompositionOptions<TNode, TEdge>) {
  const localPersistenceStore = {
    read: () => localPersistenceState(options.readCanvasState()),
    subscribe: (
      listener: (
        state: CanvasLocalPersistenceState,
        previous: CanvasLocalPersistenceState,
      ) => void,
    ) =>
      options.subscribeCanvasState((state, previous) =>
        listener(localPersistenceState(state), localPersistenceState(previous)),
      ),
  };
  const draftPersistenceStore = {
    read: () => draftPersistenceState(options.readCanvasState()),
  };
  const saveControllerStore = {
    read: () => saveControllerState(options.readCanvasState()),
    subscribe: (
      listener: (
        state: CanvasSaveControllerState<TNode, TEdge>,
        previous: CanvasSaveControllerState<TNode, TEdge>,
      ) => void,
    ) =>
      options.subscribeCanvasState((state, previous) =>
        listener(saveControllerState(state), saveControllerState(previous)),
      ),
    acknowledgePendingClear: () =>
      options.readCanvasState().acknowledgePendingClear(),
  };
  const hydrationLifecycleStore = {
    read: () => hydrationLifecycleState(options.readCanvasState()),
  };
  const runtimeBridgeStore = {
    read: () => runtimeBridgeState(options.readCanvasState()),
  };
  const useSaveController = createCanvasSaveControllerHook(saveControllerStore);
  const useHydrationLifecycle = createCanvasHydrationLifecycleHook(
    hydrationLifecycleStore,
    {
      loadCanvas: (project, canvasId, signal) =>
        getFreezoneCanvas(project, canvasId, { signal }),
    },
  );
  const useRuntimeBridge = createCanvasRuntimeBridgeHook(runtimeBridgeStore);

  const dependencies: CanvasSyncHookDependencies<TNode, TEdge> = {
    selection: {
      useSetCanvasData: () =>
        options.useCanvasState((state) => state.setCanvasData),
      useApplyCanvasDataEdit: () =>
        options.useCanvasState((state) => state.applyCanvasDataEdit),
      useHydrateCanvasDraft: () =>
        options.useCanvasState((state) => state.hydrateCanvasDraft),
      useRestoreHistory: () =>
        options.useCanvasState((state) => state.restoreHistory),
      useSetViewportState: () =>
        options.useCanvasState((state) => state.setViewportState),
      readUserEditsSinceHydrate: () =>
        options.readCanvasState().userEditsSinceHydrate,
      readViewportBookmarks: () => options.readCanvasState().viewportBookmarks,
    },
    localPersistenceStore,
    draftPersistenceStore,
    saveControllerStore,
    hydrationLifecycleStore,
    runtimeBridgeStore,
    useViewportPort: options.useViewportPort,
    useDraftPersistenceController: useCanvasDraftPersistenceController,
    useRuntimeBridge,
    useHydrationLifecycle,
    useHistoryPersistence: useCanvasHistoryPersistence,
    useSaveController,
    useViewportPersistence: useCanvasViewportPersistence,
    useConflictController: useCanvasConflictController,
    usePresetRefreshController: useCanvasPresetRefreshController,
    addBeforeUnload: (listener) =>
      window.addEventListener("beforeunload", listener),
    removeBeforeUnload: (listener) =>
      window.removeEventListener("beforeunload", listener),
  };
  return createUseCanvasSync(dependencies);
}
