// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";

import type { LibraryAsset } from "../domain/assetLibraryModel";
import { AssetLibraryPanel } from "./AssetLibraryPanel";
import { CommitDialog } from "./CommitDialog";
import { CompareDialog } from "./CompareDialog";
import { CreateIdentityDialog } from "./CreateIdentityDialog";
import {
  BackupStatusIndicator,
  CanvasConflictOverlay,
  CanvasErrorOverlay,
  CanvasLoadingOverlay,
  CanvasLoadingScreen,
  FreezoneToast,
} from "./FreezoneCanvasFeedback";
import { FreezoneChatDock } from "./FreezoneChatDock";
import { NodeReplaceDragPreview } from "./NodeReplaceDragPreview";
import type { FreezoneShellController } from "./useFreezoneShellController";

export interface FreezoneShellCanvasRenderProps {
  projectId: string;
  canvasId: string;
  onBlankPaneClick(): void;
  controlsPlacement: "bottom-right";
}

export interface FreezoneShellMaskEditorRenderProps {
  project: string;
  baseUrl: string;
  baseLabel: string;
  onClose(): void;
  onResult(url: string): void;
}

export interface FreezoneShellViewProps {
  controller: FreezoneShellController;
  renderCanvas(props: FreezoneShellCanvasRenderProps): ReactNode;
  renderMaskEditor(props: FreezoneShellMaskEditorRenderProps): ReactNode;
  addAssetToCanvas(asset: LibraryAsset, index: number): void;
}

export function FreezoneShellView({
  controller,
  renderCanvas,
  renderMaskEditor,
  addAssetToCanvas,
}: FreezoneShellViewProps) {
  const {
    assetLibrary,
    canvas,
    chat,
    commitDialog,
    compareDialog,
    createIdentityDialog,
    maskEditor,
    toast,
  } = controller;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      <div className="relative flex flex-1 min-h-0">
        <main className="relative h-full min-w-0 flex-1">
          {canvas.showBlockingLoading ? (
            <CanvasLoadingScreen />
          ) : (
            renderCanvas({
              projectId: controller.projectId,
              canvasId: controller.canvasId,
              onBlankPaneClick: canvas.onBlankPaneClick,
              controlsPlacement: "bottom-right",
            })
          )}
          {canvas.showLoadingOverlay && <CanvasLoadingOverlay />}
          {canvas.status === "error" && (
            <CanvasErrorOverlay error={canvas.error} onRetry={canvas.retry} />
          )}
          {canvas.status === "conflict" && (
            <CanvasConflictOverlay
              error={canvas.error}
              canvasId={controller.canvasId}
              onRefresh={canvas.retry}
              onSaveCopy={canvas.saveConflictCopy}
              readConflictSnapshot={canvas.readConflictSnapshot}
            />
          )}
          <BackupStatusIndicator status={canvas.backupStatus} />
          <AssetLibraryPanel
            project={controller.projectId}
            metadata={assetLibrary.metadata}
            collapsed={assetLibrary.collapsed}
            onCollapsedChange={assetLibrary.setCollapsed}
            currentCanvasId={controller.canvasId}
            reloadToken={assetLibrary.reloadToken}
            onRestoreMainlineDefault={assetLibrary.restoreMainlineDefault}
            onReplaced={assetLibrary.onReplaced}
            onAddAsset={addAssetToCanvas}
          />
        </main>
        {chat.visible && (
          <FreezoneChatDock
            open={chat.open}
            onOpenChange={chat.setOpen}
            title={chat.title}
            description={chat.description}
            toggleLabel={chat.toggleLabel}
          />
        )}
      </div>
      <NodeReplaceDragPreview />
      {commitDialog && (
        <CommitDialog
          project={controller.projectId}
          sourceUrl={commitDialog.prompt.sourceUrl}
          previewUrl={commitDialog.prompt.previewUrl ?? undefined}
          sourceLabelOverride={commitDialog.prompt.sourceLabel}
          mediaType={commitDialog.prompt.mediaType}
          defaultTarget={commitDialog.prompt.defaultTarget}
          directorControlBundle={commitDialog.prompt.directorControlBundle}
          nodeData={commitDialog.prompt.nodeData}
          getNodeData={commitDialog.getNodeData}
          onClose={commitDialog.close}
          onSuccess={commitDialog.succeed}
        />
      )}
      {createIdentityDialog && (
        <CreateIdentityDialog
          project={controller.projectId}
          sourceUrl={createIdentityDialog.source.imageUrl}
          previewUrl={createIdentityDialog.source.previewUrl ?? undefined}
          defaultCharacter={createIdentityDialog.defaultCharacter}
          onClose={createIdentityDialog.close}
          onSuccess={createIdentityDialog.succeed}
        />
      )}
      {compareDialog && (
        <CompareDialog
          left={compareDialog.pair.left}
          right={compareDialog.pair.right}
          onClose={compareDialog.close}
        />
      )}
      {maskEditor &&
        renderMaskEditor({
          project: controller.projectId,
          baseUrl: maskEditor.target.url,
          baseLabel: maskEditor.target.label,
          onClose: maskEditor.close,
          onResult: maskEditor.succeed,
        })}
      {toast && <FreezoneToast text={toast.text} onClose={toast.close} />}
    </div>
  );
}
