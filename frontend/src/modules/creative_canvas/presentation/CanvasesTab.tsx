// Copyright (c) 2026 AI anime
import { useCanvasBrowserController } from "../canvasBrowserComposition";
import { CanvasBrowserView } from "./CanvasBrowserView";

interface CanvasesTabProps {
  project: string;
  currentCanvasId: string;
  /**
   * Refresh the current preset/mainline canvas in place. The shell exposes
   * this via `useCanvasSync.restoreMainlineDefault`; we only show the button
   * when the current canvas is a preset/mainline canvas (`hasPresetLabel`).
   */
  onRestoreMainlineDefault?: () => Promise<void> | void;
  hasPresetLabel: boolean;
  reloadToken?: number;
}

export function CanvasesTab({
  project,
  currentCanvasId,
  onRestoreMainlineDefault,
  hasPresetLabel,
  reloadToken,
}: CanvasesTabProps) {
  const controller = useCanvasBrowserController({
    project,
    currentCanvasId,
    onRestoreMainlineDefault,
    reloadToken,
  });

  return (
    <CanvasBrowserView
      currentCanvasId={currentCanvasId}
      hasPresetLabel={hasPresetLabel}
      username={controller.username}
      sections={controller.sections}
      loading={controller.loading}
      error={controller.error}
      newCanvasName={controller.newCanvasName}
      creatingCanvas={controller.creatingCanvas}
      deletingCanvasId={controller.deletingCanvasId}
      restoringMainline={controller.restoringMainline}
      onNewCanvasNameChange={controller.setNewCanvasName}
      onSwitch={controller.switchTo}
      onRestoreMainline={controller.restoreMainline}
      onCreateCanvas={controller.createCanvas}
      onDeleteCanvas={controller.deleteCanvas}
    />
  );
}
