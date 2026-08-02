// Copyright (c) 2026 AI anime
import type { FreezoneCanvasPayload } from "@/modules/creative_canvas/domain/canvasStorage";
import { canvasDraftSignature } from "./canvasDraft";
import type { CanvasSyncViewport } from "./canvasSyncStorage";
import {
  resolveCanvasClientSaveId,
  type CanvasSaveIdentityArgs,
  type CanvasSaveRuntimeState,
} from "./canvasSave";
import { buildSavePayload, decideSaveAction } from "./canvasSyncCore";

export interface CanvasUnloadSaveArgs extends CanvasSaveIdentityArgs {
  project: string;
  canvasId: string;
  viewport: CanvasSyncViewport;
  revision: number | null;
  envelope: Partial<FreezoneCanvasPayload>;
  hydrated: boolean;
  switching: boolean;
  lastRemoteNodeCount: number;
  mutationState: Pick<
    CanvasSaveRuntimeState,
    "userEditsSinceHydrate" | "lastMutationSource" | "pendingClearIntent"
  >;
  hasUnsettledContentSave: boolean;
  hasPendingContentSave: boolean;
  lastPersistedDraftSignature: string | null;
  cancelPendingDraft(): void;
  persistDraft(): void;
  cancelPendingContentSave(): void;
}

export interface CanvasUnloadSaveDependencies {
  generateClientSaveId(): string;
  persistViewport(
    project: string,
    canvasId: string,
    viewport: CanvasSyncViewport,
  ): void;
  saveCanvasKeepalive(
    project: string,
    canvasId: string,
    payload: FreezoneCanvasPayload,
  ): void;
}

export function createCanvasUnloadSaver(
  dependencies: CanvasUnloadSaveDependencies,
): (args: CanvasUnloadSaveArgs) => boolean {
  return (args: CanvasUnloadSaveArgs): boolean => {
    dependencies.persistViewport(args.project, args.canvasId, args.viewport);

    if (!args.hasUnsettledContentSave) return false;
    const draftSignature = canvasDraftSignature(
      args.nodes,
      args.edges,
      args.metadata ?? null,
    );
    if (draftSignature === args.lastPersistedDraftSignature) return false;

    args.cancelPendingDraft();
    args.persistDraft();
    if (!args.hasPendingContentSave) return false;
    args.cancelPendingContentSave();
    if (args.revision == null || !args.hydrated) return false;

    const decision = decideSaveAction({
      hydrated: args.hydrated,
      switching: args.switching,
      nodeCount: args.nodes.length,
      edgeCount: args.edges.length,
      lastRemoteNodeCount: args.lastRemoteNodeCount,
      userEditsSinceHydrate: args.mutationState.userEditsSinceHydrate,
      lastMutationSource: args.mutationState.lastMutationSource,
      pendingClearIntent: args.mutationState.pendingClearIntent,
    });
    if (decision.kind !== "send") return false;

    const clientSaveId = resolveCanvasClientSaveId(
      args,
      dependencies.generateClientSaveId,
    );
    const payload = buildSavePayload({
      canvasId: args.canvasId,
      nodes: args.nodes,
      edges: args.edges,
      viewport: args.viewport,
      metadata: args.metadata,
      baseRevision: args.revision,
      clientSaveId,
      decision,
      envelope: args.envelope,
    });
    dependencies.saveCanvasKeepalive(args.project, args.canvasId, payload);
    return true;
  };
}
