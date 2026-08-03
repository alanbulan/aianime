import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");
const DESKTOP_ROOT = resolve(process.cwd(), "../desktop");

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function relativeSource(path: string): string {
  return relative(SRC_ROOT, path).replace(/\\/g, "/");
}

function importSpecifiers(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

describe("round 2 residual architecture boundaries", () => {
  it("establishes Creative Canvas as a real module owner", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/creative_canvas");
    const publicPath = resolve(moduleRoot, "public.ts");
    const capabilityRoot = resolve(moduleRoot, "domain/capabilities");
    const projectionFiles = [
      "canvasStorageRetention.ts",
      "canvasProjection.ts",
      "canvasProjectionRequest.ts",
      "canvasProjectionRequest.test.ts",
      "canvasProjectionMetadata.ts",
      "canvasProjectionMetadata.test.ts",
      "projectionGraphIds.ts",
      "canvasMutation.ts",
      "canvasMutation.test.ts",
    ];
    const projectionApplicationFiles = [
      "canvasStorageOperations.ts",
      "canvasStorageOperations.test.ts",
      "canvasPreset.ts",
      "canvasPreset.test.ts",
      "canvasProjection.ts",
      "canvasProjection.test.ts",
      "canvasProjectionCommandEvents.ts",
      "canvasProjectionCommandEvents.test.ts",
      "canvasRuntimeState.ts",
      "canvasRuntimeState.test.ts",
      "openPresetProjection.ts",
      "openPresetProjection.test.ts",
      "contextQueries.ts",
      "contextQueries.test.ts",
      "canvasDraft.ts",
      "canvasSyncStorage.ts",
      "canvasSyncHydration.ts",
      "canvasSyncHydration.test.ts",
      "canvasConflictRecovery.ts",
      "canvasConflictRecovery.test.ts",
      "canvasProjectionGraph.ts",
      "canvasProjectionGraph.test.ts",
      "canvasPresetRefresh.ts",
      "canvasPresetRefresh.test.ts",
      "canvasSaveError.ts",
      "canvasSyncCore.ts",
      "canvasSyncCore.test.ts",
      "canvasSave.ts",
      "canvasSave.test.ts",
      "canvasUnloadSave.ts",
      "canvasUnloadSave.test.ts",
    ];
    const projectionInfrastructureFiles = [
      "browserCanvasStorageReclaimer.ts",
      "httpFreezoneCanvasStorageGateway.ts",
      "httpFreezoneCanvasStorageGateway.test.ts",
      "httpFreezoneCanvasProjectionGateway.ts",
      "httpFreezoneCanvasProjectionGateway.test.ts",
      "httpFreezoneContextQueryGateway.ts",
      "httpFreezoneContextQueryGateway.test.ts",
      "browserCanvasDraftStorageGateway.ts",
      "browserCanvasSyncStorageGateway.ts",
    ];
    const projectionCompositionFiles = [
      "assetLibraryCatalogComposition.ts",
      "assetLibraryCatalogComposition.test.tsx",
      "canvasBrowserComposition.ts",
      "canvasBrowserComposition.test.tsx",
      "canvasConflictRecoveryComposition.ts",
      "canvasDraftPersistenceComposition.ts",
      "canvasLocalPersistenceComposition.ts",
      "canvasPresetRefreshComposition.ts",
      "canvasProjectionStatusLifecycleComposition.ts",
      "canvasProjectionStatusLifecycleComposition.test.tsx",
      "canvasProjectionCommandComposition.ts",
      "canvasCommitControllerComposition.ts",
      "canvasSaveControllerComposition.ts",
      "canvasStorageComposition.ts",
      "canvasStorageRetentionComposition.ts",
      "projectionComposition.ts",
      "presetProjectionComposition.ts",
      "presetProjectionComposition.test.ts",
      "contextQueryComposition.ts",
      "canvasDraftComposition.ts",
      "canvasSyncComposition.ts",
    ];
    const commitDomainFiles = [
      "assetCommit.ts",
      "canvasCommitEligibility.ts",
      "canvasCommitEligibility.test.ts",
      "canvasCommitSource.ts",
      "directorWorldCommit.ts",
      "pushTarget.ts",
      "pushTarget.test.ts",
    ];
    const commitApplicationFiles = [
      "canvasCommitEvents.ts",
      "canvasCommitEvents.test.ts",
      "canvasCommitRules.ts",
      "canvasCommitRules.test.ts",
      "committedNodePatch.ts",
      "committedNodePatch.test.ts",
      "sceneDirectorWorldCommit.ts",
      "sceneDirectorWorldCommit.test.ts",
      "directorRenderCommit.ts",
      "directorRenderCommit.test.ts",
      "directorWorldSceneSaveRegistry.ts",
    ];
    const commitInfrastructureFiles = [
      "assetWorldSceneDirectorCommitGateway.ts",
      "browserDirectorRenderCommitGateway.ts",
    ];
    const commitCompositionFiles = ["directorCommitComposition.ts"];
    const mainlineContextFiles = [
      "mainlineContext.ts",
      "currentBeatContext.ts",
      "currentBeatContext.test.ts",
    ];
    const canvasProjectContextDomainFiles = [
      "canvasBeatContextReferences.ts",
      "canvasBeatContextReferences.test.ts",
    ];
    const canvasProjectContextPresentationFiles = [
      "useCanvasBeatContextPrefetch.ts",
      "useCanvasBeatContextPrefetch.test.tsx",
      "useCanvasProjectContextController.ts",
      "useCanvasProjectContextController.test.tsx",
      "useCanvasAsyncNodeTasks.ts",
      "useCanvasAsyncNodeTasks.test.tsx",
      "useCanvasGenerationRecoveryController.ts",
      "useCanvasGenerationRecoveryController.test.tsx",
    ];
    const canvasSelectionDomainFiles = [
      "canvasSelection.ts",
      "canvasSelection.test.ts",
      "canvasSelectionDeletion.ts",
      "canvasSelectionDeletion.test.ts",
      "canvasNodeDeletion.ts",
      "canvasNodeDeletion.test.ts",
    ];
    const canvasGroupDomainFiles = [
      "storyboardGroup.ts",
      "storyboardGroup.test.ts",
      "canvasGroupRemoval.ts",
      "canvasGroupRemoval.test.ts",
      "canvasAutoGrouping.ts",
      "canvasAutoGrouping.test.ts",
      "canvasGroupArrangement.ts",
      "canvasGroupArrangement.test.ts",
      "canvasGroupFit.ts",
      "canvasGroupFit.test.ts",
      "canvasStoryboardGroupConfig.ts",
      "canvasStoryboardGroupConfig.test.ts",
      "canvasStoryboardGroupConversion.ts",
      "canvasStoryboardGroupConversion.test.ts",
      "canvasStoryboardGroupMembers.ts",
      "canvasStoryboardGroupMembers.test.ts",
      "canvasGrouping.ts",
      "groupColors.ts",
      "storyboardCellPreview.ts",
      "storyboardCellPreview.test.ts",
      "canvasSnapAlignment.ts",
      "canvasSnapAlignment.test.ts",
    ];
    const canvasGroupApplicationFiles = [
      "canvasGroupCreation.ts",
      "canvasGroupCreation.test.ts",
      "canvasStoryboardGroupCreation.ts",
      "canvasStoryboardGroupCreation.test.ts",
      "canvasStoryboardGroupMemberAddition.ts",
      "canvasStoryboardGroupMemberAddition.test.ts",
    ];
    const canvasGroupPresentationFiles = [
      "useGroupNodeController.ts",
      "useGroupNodeController.test.tsx",
      "GroupNodeView.tsx",
      "GroupNodeView.test.tsx",
      "useGroupNodeToolbarController.ts",
      "useGroupNodeToolbarController.test.tsx",
      "GroupNodeToolbarActionsView.tsx",
      "useStoryboardGroupToolbarController.ts",
      "useStoryboardGroupToolbarController.test.tsx",
      "StoryboardGroupToolbarView.tsx",
    ];
    const canvasSnapPresentationFiles = [
      "useCanvasSnapAlignment.ts",
      "useCanvasSnapAlignment.test.tsx",
      "snapAlignStore.ts",
      "CanvasSnapAlignButton.tsx",
      "CanvasSnapAlignGuides.tsx",
    ];
    const canvasViewportDomainFiles = [
      "viewportBookmarks.ts",
      "viewportBookmarks.test.ts",
      "canvasAutoLayout.ts",
      "canvasAutoLayout.test.ts",
    ];
    const canvasViewportApplicationFiles = [
      "bookmarkActions.ts",
      "bookmarkActions.test.ts",
    ];
    const canvasViewportPresentationFiles = [
      "useCanvasViewportBookmarkShortcuts.ts",
      "useCanvasViewportBookmarkShortcuts.test.tsx",
      "useCanvasViewportCommit.ts",
      "useCanvasViewportCommit.test.tsx",
      "useCanvasViewportMetrics.ts",
      "useCanvasViewportMetrics.test.tsx",
      "useCanvasLifecycle.ts",
      "useCanvasLifecycle.test.tsx",
      "useCanvasEdgePan.ts",
      "useCanvasEdgePan.test.tsx",
      "useCanvasViewportRuntimeController.ts",
      "useCanvasViewportRuntimeController.test.tsx",
      "useCanvasAutoLayoutController.ts",
      "useCanvasAutoLayoutController.test.tsx",
      "useCanvasPendingNodeFocus.ts",
      "useCanvasPendingNodeFocus.test.tsx",
      "useCanvasNodeFocusController.ts",
      "useCanvasNodeFocusController.test.tsx",
      "useCanvasMinimapVisibility.ts",
      "useCanvasMinimapVisibility.test.tsx",
      "trackpadPanStore.ts",
      "trackpadPanStore.test.ts",
      "CanvasMinimapButton.tsx",
      "CanvasBookmarkContextMenu.tsx",
      "CanvasBookmarkContextMenu.test.tsx",
      "CanvasViewportBookmarks.tsx",
      "CanvasViewportBookmarks.test.tsx",
      "CanvasMinimapBookmarksOverlay.tsx",
      "edgeVisibilityStore.ts",
      "edgeVisibilityStore.test.ts",
      "CanvasZoomControl.tsx",
      "CanvasZoomControl.test.tsx",
    ];
    const canvasCommandPresentationFiles = [
      "useCanvasKeyboardShortcuts.ts",
      "useCanvasKeyboardShortcuts.test.tsx",
      "useCanvasPaneContextMenu.ts",
      "useCanvasPaneContextMenu.test.tsx",
      "useCanvasContextMenuController.ts",
      "useCanvasContextMenuController.test.tsx",
      "useCanvasCommandSurfaceController.ts",
      "useCanvasCommandSurfaceController.test.tsx",
      "CanvasContextMenu.tsx",
    ];
    const canvasNodeInteractionPresentationFiles = [
      "useCanvasNodeHover.ts",
      "useCanvasNodeHover.test.tsx",
      "useCanvasNodePlacementConfirm.ts",
      "useCanvasNodePlacementConfirm.test.tsx",
      "useCanvasNodePlacementController.ts",
      "useCanvasNodePlacementController.test.tsx",
      "useCanvasPaneClickController.ts",
      "useCanvasPaneClickController.test.tsx",
      "useCanvasNodeMenuShortcut.ts",
      "useCanvasNodeMenuShortcut.test.tsx",
      "useCanvasNodeClickController.ts",
      "useCanvasNodeClickController.test.tsx",
      "useCanvasNodeMenuSelectionController.ts",
      "useCanvasNodeMenuSelectionController.test.tsx",
      "useCanvasQuickAddController.ts",
      "useCanvasQuickAddController.test.tsx",
      "useCanvasNodeMenuStateController.ts",
      "useCanvasNodeMenuStateController.test.tsx",
    ];
    const canvasNodeInteractionApplicationFiles = [
      "canvasNodeMenuSelection.ts",
      "canvasNodeMenuSelection.test.ts",
    ];
    const canvasConnectionPreviewDomainFiles = [
      "canvasConnectionPreview.ts",
      "canvasConnectionPreview.test.ts",
      "canvasConnection.ts",
      "canvasConnection.test.ts",
      "canvasEdgeNormalization.ts",
      "canvasEdgeNormalization.test.ts",
      "skillConnectionEdges.ts",
      "skillConnectionEdges.test.ts",
      "canvasGeometry.ts",
      "canvasGeometry.test.ts",
      "canvasBatchConnection.ts",
      "canvasBatchConnection.test.ts",
      "beatContextRoleBindings.ts",
      "beatContextRoleBindings.test.ts",
    ];
    const canvasConnectionApplicationFiles = [
      "canvasEdgeCreation.ts",
      "canvasEdgeCreation.test.ts",
    ];
    const canvasMediaProjectionDomainFiles = [
      "canvasAssets.ts",
      "canvasAssets.test.ts",
      "videoReferenceMedia.ts",
      "videoReferenceMedia.test.ts",
      "nodeDisplay.ts",
      "nodeDisplay.test.ts",
    ];
    const canvasConnectionPresentationFiles = [
      "canvasConnectionInteraction.ts",
      "canvasConnectionInteraction.test.ts",
      "useCanvasConnectionController.ts",
      "useCanvasConnectionController.test.tsx",
      "useCanvasBatchConnectionController.ts",
      "useCanvasBatchConnectionController.test.tsx",
      "useCanvasPlusConnectionController.ts",
      "useCanvasPlusConnectionController.test.tsx",
      "useCanvasReactFlowConnectionController.ts",
      "useCanvasReactFlowConnectionController.test.tsx",
      "useCanvasConnectionGestureController.ts",
      "useCanvasConnectionGestureController.test.tsx",
    ];
    const canvasMainlineDomainFiles = [
      "mainlineNodeFlags.ts",
      "mainlineNodeFlags.test.ts",
      "inheritMainlineFields.ts",
      "inheritMainlineFields.test.ts",
      "canvasEdgeDeletion.ts",
      "canvasEdgeDeletion.test.ts",
    ];
    const canvasMainlineApplicationFiles = [
      "canvasManagedChangeGuard.ts",
      "canvasManagedChangeGuard.test.ts",
    ];
    const canvasSelectionPresentationFiles = [
      "useCanvasSelectionSurfaceController.ts",
      "useCanvasSelectionSurfaceController.test.tsx",
      "useCanvasSelectionSync.ts",
      "useCanvasSelectionSync.test.tsx",
      "useCanvasSelectionCommandController.ts",
      "useCanvasSelectionCommandController.test.tsx",
    ];
    const skillDomainFiles = [
      "skillContract.ts",
      "skillContract.test.ts",
      "skillExecution.ts",
      "skillExecution.test.ts",
      "skillInputResolution.ts",
      "skillInputResolution.test.ts",
      "inferSkillConnectionRole.ts",
      "inferSkillConnectionRole.test.ts",
    ];
    const generationHistoryDomainFiles = [
      "generationHistoryRecord.ts",
      "generationHistoryRecord.test.ts",
      "canvasAsset.ts",
      "canvasAsset.test.ts",
    ];
    const generationHistoryApplicationFiles = [
      "generationHistory.ts",
      "generationHistory.test.ts",
      "generationHistoryAssets.ts",
      "generationHistoryAssets.test.ts",
      "canvasHistoryAssetSpawn.ts",
      "canvasHistoryAssetSpawn.test.ts",
    ];
    const generationHistoryInfrastructureFiles = [
      "freezoneGenerationHistoryGateway.ts",
      "freezoneGenerationHistoryGateway.test.ts",
    ];
    const generationHistoryPresentationFiles = [
      "useCanvasGenerationHistory.ts",
      "useCanvasGenerationHistory.test.ts",
      "useNodeGenerationHistory.ts",
      "useNodeGenerationHistory.test.tsx",
      "NodeGenerationHistory.tsx",
      "NodeGenerationHistory.test.tsx",
      "CanvasHistoryAssetCard.tsx",
      "CanvasHistoryAssetCard.test.tsx",
      "useCanvasHistoryAssetController.ts",
      "useCanvasHistoryAssetController.test.tsx",
      "useCanvasHistoryAssetsModalController.ts",
      "useCanvasHistoryAssetsModalController.test.tsx",
      "CanvasHistoryAssetsModal.tsx",
      "CanvasHistoryAssetsModalView.tsx",
      "CanvasHistoryAssetsModalView.test.tsx",
    ];
    const generationHistoryCompositionFiles = [
      "generationHistoryComposition.ts",
    ];
    const beatContextDomainFiles = ["beatContext.ts"];
    const assetLibraryDomainFiles = [
      "assetLibrary.ts",
      "assetLibraryModel.ts",
      "assetLibraryModel.test.ts",
      "assetDrag.ts",
    ];
    const assetLibraryApplicationFiles = [
      "assetLibrary.ts",
      "assetLibraryModalModel.ts",
      "assetLibraryModalModel.test.ts",
      "assetLibraryProjection.ts",
      "assetLibraryProjection.test.ts",
      "assetLibraryCanvasInsertion.ts",
      "assetLibraryCanvasInsertion.test.ts",
      "canvasAssetNodeSpawning.ts",
    ];
    const assetLibraryInfrastructureFiles = [
      "freezoneAssetLibraryGateway.ts",
      "freezoneAssetLibraryGateway.test.ts",
    ];
    const assetLibraryPresentationFiles = [
      "AssetLibraryModal.tsx",
      "AssetLibraryModalView.tsx",
      "AssetLibraryModalView.test.tsx",
      "useAssetLibraryModalController.ts",
      "useAssetLibraryModalController.test.tsx",
    ];
    const mediaTransferDomainFiles = [
      "videoFileTypes.ts",
      "videoFileTypes.test.ts",
    ];
    const toolImageGeometryDomainFiles = [
      "toolImageGeometry.ts",
      "toolImageGeometry.test.ts",
    ];
    const mediaOperationDomainFiles = [
      "imageTo3d.ts",
      "imageTo3d.test.ts",
      "multiAngle.ts",
      "multiAngle.test.ts",
      "outpaint.ts",
      "outpaint.test.ts",
      "redraw.ts",
      "redraw.test.ts",
      "relight.ts",
      "relight.test.ts",
      "scene360.ts",
      "upscale.ts",
      "upscale.test.ts",
      "videoUpscale.ts",
      "videoUpscale.test.ts",
    ];
    const mediaOperationApplicationFiles = [
      "completeCanvasMediaGenerationTask.ts",
      "completeCanvasMediaGenerationTask.test.ts",
      "generateCanvasImage.ts",
      "generateCanvasImage.test.ts",
      "generateCanvasImageTo3d.ts",
      "generateCanvasImageTo3d.test.ts",
      "generateCanvasMultiAngle.ts",
      "generateCanvasMultiAngle.test.ts",
      "generateCanvasOutpaint.ts",
      "generateCanvasOutpaint.test.ts",
      "generateCanvasRedraw.ts",
      "generateCanvasRedraw.test.ts",
      "generateCanvasUpscale.ts",
      "generateCanvasUpscale.test.ts",
      "generateCanvasVideoUpscale.ts",
      "generateCanvasVideoUpscale.test.ts",
    ];
    const mediaOperationInfrastructureFiles = [
      "freezoneImageGenerationGateway.ts",
      "freezoneImageGenerationGateway.test.ts",
      "freezoneImageTo3dGenerationGateway.ts",
      "freezoneImageTo3dGenerationGateway.test.ts",
      "freezoneMultiAngleGenerationGateway.ts",
      "freezoneMultiAngleGenerationGateway.test.ts",
      "freezoneOutpaintGenerationGateway.ts",
      "freezoneOutpaintGenerationGateway.test.ts",
      "freezoneRedrawGenerationGateway.ts",
      "freezoneRedrawGenerationGateway.test.ts",
      "freezoneUpscaleGenerationGateway.ts",
      "freezoneUpscaleGenerationGateway.test.ts",
      "freezoneVideoUpscaleGenerationGateway.ts",
      "freezoneVideoUpscaleGenerationGateway.test.ts",
    ];
    const textGenerationApplicationFiles = [
      "generateCanvasStoryScript.ts",
      "generateCanvasStoryScript.test.ts",
      "translateCanvasText.ts",
      "translateCanvasText.test.ts",
    ];
    const textGenerationInfrastructureFiles = [
      "freezoneCanvasTextTranslationGateway.ts",
      "freezoneCanvasTextTranslationGateway.test.ts",
      "freezoneStoryScriptGenerationGateway.ts",
      "freezoneStoryScriptGenerationGateway.test.ts",
    ];
    const videoStoryApplicationFiles = [
      "analyzeCanvasVideoStory.ts",
      "analyzeCanvasVideoStory.test.ts",
      "videoStoryNormalizer.ts",
      "videoStoryNormalizer.test.ts",
    ];
    const videoStoryDomainFiles = ["videoStory.ts"];
    const videoStoryInfrastructureFiles = [
      "freezoneVideoStoryAnalysisGateway.ts",
      "freezoneVideoStoryAnalysisGateway.test.ts",
    ];
    const videoGenerationApplicationFiles = [
      "completeVideoGenerationTask.ts",
      "completeVideoGenerationTask.test.ts",
      "generationOutputUrl.ts",
      "generationOutputUrl.test.ts",
      "submitVideoGeneration.ts",
      "submitVideoGeneration.test.ts",
    ];
    const videoGenerationDomainFiles = [
      "videoGenerationModel.ts",
      "videoGenerationModel.test.ts",
      "videoReferenceLimits.ts",
      "videoReferenceLimits.test.ts",
    ];
    const videoGenerationInfrastructureFiles = [
      "freezoneVideoGenerationSubmissionGateway.ts",
      "freezoneVideoGenerationSubmissionGateway.test.ts",
    ];
    const videoComposeApplicationFiles = [
      "composeCanvasVideo.ts",
      "composeCanvasVideo.test.ts",
      "composeVideoClip.ts",
      "composeVideoClip.test.ts",
      "videoFrameStrip.ts",
      "videoComposePreview.ts",
      "videoComposePreview.test.ts",
      "videoComposeCover.ts",
      "videoComposeCover.test.ts",
      "videoComposeTimelineSession.ts",
      "videoComposeTimelineSession.test.ts",
    ];
    const videoComposeDomainFiles = [
      "videoCompose.ts",
      "videoComposeInputs.ts",
      "videoComposeInputs.test.ts",
      "videoClipRange.ts",
      "videoClipRange.test.ts",
      "videoComposeTimeline.ts",
      "videoComposeTimeline.test.ts",
      "videoComposeTimelineEdits.ts",
      "videoComposeTimelineEdits.test.ts",
      "videoComposeTimelineGestures.ts",
      "videoComposeTimelineGestures.test.ts",
    ];
    const videoComposeInfrastructureFiles = [
      "browserVideoComposeExportRuntime.ts",
      "browserVideoComposeExportRuntime.test.ts",
      "browserVideoComposeMediaRuntime.ts",
      "browserVideoComposeMediaRuntime.test.ts",
      "browserVideoComposeCoverRuntime.ts",
      "browserVideoComposeCoverRuntime.test.ts",
      "browserVideoFrameStrip.ts",
      "browserVideoFrameStrip.test.ts",
      "freezoneVideoComposeGateway.ts",
      "freezoneVideoComposeGateway.test.ts",
    ];
    const videoComposePresentationFiles = [
      "CoverEditor.tsx",
      "CoverEditor.test.tsx",
      "VideoComposeModal.tsx",
      "useVideoComposeTimelineSessionController.ts",
      "useVideoComposeTimelineSessionController.test.tsx",
      "useVideoComposeTimelineEditorController.ts",
      "useVideoComposeTimelineEditorController.test.tsx",
      "useVideoComposeTimelinePointerController.ts",
      "useVideoComposeTimelinePointerController.test.tsx",
      "useVideoComposeKeyboardController.ts",
      "useVideoComposeKeyboardController.test.tsx",
      "useVideoComposePlaybackClock.ts",
      "useVideoComposePlaybackClock.test.tsx",
      "useVideoComposePlaybackController.ts",
      "useVideoComposePlaybackController.test.tsx",
      "useVideoComposeTrackMediaSync.ts",
      "useVideoComposeTrackMediaSync.test.tsx",
      "useVideoComposeExportController.ts",
      "useVideoComposeExportController.test.tsx",
      "audioPeaks.ts",
      "filmstrip.ts",
      "filmstrip.test.ts",
      "VideoComposeTrackRow.tsx",
      "VideoComposeTrackRow.test.tsx",
      "VideoComposeModalView.tsx",
      "VideoComposeModalView.test.tsx",
      "VideoComposeTimelineControls.tsx",
      "VideoComposeTimelineControls.test.tsx",
    ];
    const videoSubtitleEraseApplicationFiles = [
      "eraseVideoSubtitles.ts",
      "eraseVideoSubtitles.test.ts",
    ];
    const videoSubtitleEraseDomainFiles = ["videoSubtitleErase.ts"];
    const videoSubtitleEraseInfrastructureFiles = [
      "freezoneVideoSubtitleEraseGateway.ts",
      "freezoneVideoSubtitleEraseGateway.test.ts",
    ];
    const generationCatalogDomainFiles = [
      "cameraMovementPresets.ts",
      "imageModelCapability.ts",
      "videoGenerationMode.ts",
    ];
    const generationCatalogPresentationFiles = [
      "generationCatalogHooks.test.tsx",
      "useCanvasCameraOptions.ts",
      "useCanvasImageModels.ts",
      "useCanvasStyleTemplates.ts",
      "useCanvasVideoCameraTemplates.ts",
      "useCanvasVideoModels.ts",
    ];
    const presentationFiles = [
      "assetLibraryViewModel.ts",
      "assetLibraryViewModel.test.ts",
      "canvasBrowserViewModel.ts",
      "canvasBrowserViewModel.test.ts",
      "canvasStorageQueryHooks.ts",
      "useCanvasConflictController.ts",
      "useCanvasConflictController.test.tsx",
      "useCanvasDraftPersistenceController.ts",
      "useCanvasDraftPersistenceController.test.tsx",
      "useCanvasLocalPersistence.ts",
      "useCanvasLocalPersistence.test.tsx",
      "useCanvasPresetRefreshController.ts",
      "useCanvasPresetRefreshController.test.tsx",
      "useCanvasProjectionCommandController.ts",
      "useCanvasProjectionCommandController.test.tsx",
      "useCanvasSaveController.ts",
      "useCanvasSaveController.test.tsx",
      "useCanvasSync.ts",
      "useCanvasCommitController.ts",
      "useCanvasCommitController.test.tsx",
      "useFreezoneCanvasEntryLifecycle.ts",
      "useFreezoneCanvasEntryLifecycle.test.tsx",
      "useFreezoneShellController.ts",
      "useFreezoneShellController.test.tsx",
      "FreezoneShellView.tsx",
      "FreezoneShellView.test.tsx",
      "MaskEditor.tsx",
      "MaskEditorView.tsx",
      "MaskEditorView.test.tsx",
      "useMaskEditorController.ts",
      "useMaskEditorController.test.tsx",
      "commitDialogViewModel.ts",
      "useAssetLibraryReplacementController.ts",
      "useAssetLibraryReplacementController.test.tsx",
      "AssetLibraryPanelView.tsx",
      "AssetLibraryPanelView.test.tsx",
      "AssetLibraryBeatPanels.tsx",
      "AssetLibraryBeatPanels.test.tsx",
      "AssetLibraryAssetCard.tsx",
      "AssetLibraryAssetCard.test.tsx",
      "canvasAssetDragTransfer.ts",
      "NodeReplaceDragPreview.tsx",
      "canvasInteractionTargets.ts",
      "canvasInteractionTargets.test.ts",
      "useCanvasSpacePan.ts",
      "useCanvasSpacePan.test.tsx",
      "useCanvasMarqueeSelection.ts",
      "useCanvasMarqueeSelection.test.tsx",
      "canvasMediaTransfer.ts",
      "canvasMediaTransfer.test.ts",
      "useCanvasDropIndicator.ts",
      "useCanvasDropIndicator.test.tsx",
      "useCanvasMediaDropController.ts",
      "useCanvasMediaDropController.test.tsx",
      "useCanvasMediaPaste.ts",
      "useCanvasMediaPaste.test.tsx",
      "useCanvasMediaTransferController.ts",
      "useCanvasMediaTransferController.test.tsx",
      "skillI18n.ts",
      "skillI18n.test.ts",
      "contextQueryHooks.ts",
      "FreezoneCanvasFeedback.tsx",
      "FreezoneCanvasFeedback.test.tsx",
      "FreezoneChatDock.tsx",
      "FreezoneChatDock.test.tsx",
      "FreezoneChatDockView.tsx",
      "useFreezoneChatDockController.ts",
      "useFreezoneChatDockController.test.tsx",
      "CanvasBrowserView.tsx",
      "CanvasBrowserView.test.tsx",
      "CanvasesTab.tsx",
      "CanvasesTab.test.tsx",
    ];

    expect(existsSync(publicPath)).toBe(true);
    expect(sourceFiles(capabilityRoot).length).toBeGreaterThan(0);
    expect(
      sourceFiles(resolve(SRC_ROOT, "features/freezone/domain/capabilities")),
    ).toEqual([]);
    expect(
      existsSync(resolve(SRC_ROOT, "features/freezone/domain")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/freezone/infrastructure")),
    ).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "features/freezone"))).toBe(false);
    for (const file of projectionFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/domain", file)),
        file,
      ).toBe(false);
    }
    expect(
      existsSync(resolve(SRC_ROOT, "features/canvas/domain/projectionGraphIds.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/canvas/domain/canvasMutation.ts")),
    ).toBe(false);
    for (const file of projectionApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of projectionInfrastructureFiles) {
      expect(existsSync(resolve(moduleRoot, "infrastructure", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/infrastructure", file)),
        file,
      ).toBe(false);
    }
    for (const file of projectionCompositionFiles) {
      expect(existsSync(resolve(moduleRoot, file)), file).toBe(true);
    }
    expect(
      existsSync(resolve(SRC_ROOT, "features/freezone/openPresetProjectionComposition.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/freezone/canvasSyncComposition.ts")),
    ).toBe(false);
    for (const file of commitDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of commitApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of commitInfrastructureFiles) {
      expect(existsSync(resolve(moduleRoot, "infrastructure", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/infrastructure", file)),
        file,
      ).toBe(false);
    }
    for (const file of commitCompositionFiles) {
      expect(existsSync(resolve(moduleRoot, file)), file).toBe(true);
    }
    expect(
      existsSync(resolve(SRC_ROOT, "features/freezone/composition.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "__tests__/features/freezone/scene-director-world-commit.test.ts",
        ),
      ),
    ).toBe(false);
    for (const file of mainlineContextFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of canvasProjectContextDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of canvasProjectContextPresentationFiles) {
      expect(existsSync(resolve(moduleRoot, "presentation", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/hooks", file)),
        file,
      ).toBe(false);
    }
    for (const file of canvasSelectionDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of canvasGroupDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of canvasGroupApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of canvasGroupPresentationFiles) {
      expect(existsSync(resolve(moduleRoot, "presentation", file)), file).toBe(
        true,
      );
    }
    for (const retiredGroupPresentationPath of [
      "features/canvas/hooks/useGroupNodeController.ts",
      "features/canvas/hooks/useGroupNodeController.test.tsx",
      "features/canvas/nodes/GroupNodeView.tsx",
      "features/canvas/nodes/GroupNodeView.test.tsx",
      "features/canvas/hooks/useGroupNodeToolbarController.ts",
      "features/canvas/hooks/useGroupNodeToolbarController.test.tsx",
      "features/canvas/ui/GroupNodeToolbarActionsView.tsx",
      "features/canvas/ui/StoryboardGroupToolbar.tsx",
    ]) {
      expect(
        existsSync(resolve(SRC_ROOT, retiredGroupPresentationPath)),
        retiredGroupPresentationPath,
      ).toBe(false);
    }
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "__tests__/features/canvas/storyboard-cell-preview.test.ts",
        ),
      ),
    ).toBe(false);
    for (const retiredSnapAlignmentPath of [
      "features/canvas/hooks/useCanvasSnapAlignment.ts",
      "features/canvas/hooks/useCanvasSnapAlignment.test.tsx",
      "features/canvas/snap-align/snapAlignStore.ts",
      "features/canvas/snap-align/CanvasSnapAlignButton.tsx",
      "features/canvas/snap-align/SnapAlignGuides.tsx",
      "features/canvas/snap-align/computeSnapAlign.ts",
      "__tests__/features/canvas/snap-align-index.test.ts",
    ]) {
      expect(
        existsSync(resolve(SRC_ROOT, retiredSnapAlignmentPath)),
        retiredSnapAlignmentPath,
      ).toBe(false);
    }
    for (const file of canvasSnapPresentationFiles) {
      expect(
        existsSync(resolve(moduleRoot, "presentation", file)),
        file,
      ).toBe(true);
    }
    for (const file of canvasViewportDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
    }
    for (const file of canvasViewportApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
    }
    for (const file of canvasViewportPresentationFiles) {
      expect(
        existsSync(resolve(moduleRoot, "presentation", file)),
        file,
      ).toBe(true);
    }
    for (const file of canvasCommandPresentationFiles) {
      expect(
        existsSync(resolve(moduleRoot, "presentation", file)),
        file,
      ).toBe(true);
    }
    for (const file of canvasNodeInteractionPresentationFiles) {
      expect(
        existsSync(resolve(moduleRoot, "presentation", file)),
        file,
      ).toBe(true);
    }
    for (const file of canvasNodeInteractionApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
    }
    for (const file of canvasConnectionPreviewDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
    }
    for (const file of canvasConnectionApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
    }
    for (const file of canvasMediaProjectionDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
    }
    for (const file of canvasConnectionPresentationFiles) {
      expect(
        existsSync(resolve(moduleRoot, "presentation", file)),
        file,
      ).toBe(true);
    }
    for (const retiredConnectionPath of [
      "features/canvas/domain/canvasConnection.ts",
      "features/canvas/domain/canvasConnection.test.ts",
      "features/canvas/domain/canvasEdgeNormalization.ts",
      "features/canvas/domain/canvasEdgeNormalization.test.ts",
      "features/canvas/domain/skillConnectionEdges.ts",
      "features/canvas/domain/canvasGeometry.ts",
      "features/canvas/domain/canvasGeometry.test.ts",
      "features/canvas/domain/canvasBatchConnection.ts",
      "features/canvas/domain/canvasBatchConnection.test.ts",
      "features/canvas/application/canvasEdgeCreation.ts",
      "features/canvas/application/canvasEdgeCreation.test.ts",
      "features/canvas/ui/canvasConnectionInteraction.ts",
      "features/canvas/ui/canvasConnectionInteraction.test.ts",
      "features/canvas/hooks/useCanvasConnectionController.ts",
      "features/canvas/hooks/useCanvasConnectionController.test.tsx",
      "features/canvas/hooks/useCanvasBatchConnectionController.ts",
      "features/canvas/hooks/useCanvasBatchConnectionController.test.tsx",
      "features/canvas/hooks/useCanvasPlusConnectionController.ts",
      "features/canvas/hooks/useCanvasPlusConnectionController.test.tsx",
      "features/canvas/hooks/useCanvasReactFlowConnectionController.ts",
      "features/canvas/hooks/useCanvasReactFlowConnectionController.test.tsx",
      "features/canvas/hooks/useCanvasConnectionGestureController.ts",
      "features/canvas/hooks/useCanvasConnectionGestureController.test.tsx",
      "features/canvas/domain/canvasAssets.ts",
      "features/canvas/domain/canvasAssets.test.ts",
      "features/canvas/domain/videoReferenceMedia.ts",
      "features/canvas/domain/videoReferenceMedia.test.ts",
      "features/canvas/domain/beatContextRoleBindings.ts",
      "features/canvas/domain/beatContextRoleBindings.test.ts",
      "features/canvas/domain/nodeDisplay.ts",
      "__tests__/features/canvas/skill-connection-edges.test.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredConnectionPath))).toBe(false);
    }
    for (const retiredViewportPath of [
      "features/canvas/domain/viewportBookmarks.ts",
      "__tests__/features/canvas/viewport-bookmarks-domain.test.ts",
      "features/canvas/application/bookmarkActions.ts",
      "features/canvas/hooks/useCanvasViewportBookmarkShortcuts.ts",
      "features/canvas/hooks/useCanvasViewportBookmarkShortcuts.test.tsx",
      "features/canvas/hooks/useCanvasViewportCommit.ts",
      "features/canvas/hooks/useCanvasViewportCommit.test.tsx",
      "features/canvas/hooks/useCanvasViewportMetrics.ts",
      "features/canvas/hooks/useCanvasViewportMetrics.test.tsx",
      "features/canvas/hooks/useCanvasLifecycle.ts",
      "features/canvas/hooks/useCanvasLifecycle.test.tsx",
      "features/canvas/hooks/useCanvasEdgePan.ts",
      "features/canvas/hooks/useCanvasEdgePan.test.tsx",
      "features/canvas/hooks/useCanvasViewportRuntimeController.ts",
      "features/canvas/hooks/useCanvasViewportRuntimeController.test.tsx",
      "features/canvas/application/autoLayout.ts",
      "__tests__/features/canvas/auto-layout.test.ts",
      "features/canvas/hooks/useCanvasAutoLayoutController.ts",
      "features/canvas/hooks/useCanvasAutoLayoutController.test.tsx",
      "features/canvas/hooks/useCanvasPendingNodeFocus.ts",
      "features/canvas/hooks/useCanvasPendingNodeFocus.test.tsx",
      "features/canvas/hooks/useCanvasNodeFocusController.ts",
      "features/canvas/hooks/useCanvasNodeFocusController.test.tsx",
      "features/canvas/hooks/useCanvasMinimapVisibility.ts",
      "features/canvas/hooks/useCanvasMinimapVisibility.test.tsx",
      "features/canvas/trackpad-pan/trackpadPanStore.ts",
      "features/canvas/ui/CanvasMinimapButton.tsx",
      "features/canvas/ui/CanvasBookmarkContextMenu.tsx",
      "features/canvas/ui/CanvasViewportBookmarks.tsx",
      "features/canvas/ui/CanvasMinimapBookmarksOverlay.tsx",
      "__tests__/features/canvas/canvas-bookmark-context-menu.test.tsx",
      "__tests__/features/canvas/canvas-viewport-bookmarks.test.tsx",
      "features/canvas/ui/edgeVisibilityStore.ts",
      "features/canvas/ui/CanvasZoomControl.tsx",
    ]) {
      expect(
        existsSync(resolve(SRC_ROOT, retiredViewportPath)),
        retiredViewportPath,
      ).toBe(false);
    }
    for (const retiredCommandPath of [
      "features/canvas/hooks/useCanvasKeyboardShortcuts.ts",
      "features/canvas/hooks/useCanvasKeyboardShortcuts.test.tsx",
      "features/canvas/hooks/useCanvasPaneContextMenu.ts",
      "features/canvas/hooks/useCanvasPaneContextMenu.test.tsx",
      "features/canvas/hooks/useCanvasContextMenuController.ts",
      "features/canvas/hooks/useCanvasContextMenuController.test.tsx",
      "features/canvas/hooks/useCanvasCommandSurfaceController.ts",
      "features/canvas/hooks/useCanvasCommandSurfaceController.test.tsx",
      "features/canvas/ui/CanvasContextMenu.tsx",
    ]) {
      expect(
        existsSync(resolve(SRC_ROOT, retiredCommandPath)),
        retiredCommandPath,
      ).toBe(false);
    }
    for (const retiredInteractionPath of [
      "features/canvas/hooks/useCanvasNodeHover.ts",
      "features/canvas/hooks/useCanvasNodeHover.test.tsx",
      "features/canvas/hooks/useCanvasNodePlacementConfirm.ts",
      "features/canvas/hooks/useCanvasNodePlacementConfirm.test.tsx",
      "features/canvas/hooks/useCanvasNodePlacementController.ts",
      "features/canvas/hooks/useCanvasNodePlacementController.test.tsx",
      "features/canvas/hooks/useCanvasPaneClickController.ts",
      "features/canvas/hooks/useCanvasPaneClickController.test.tsx",
      "features/canvas/hooks/useCanvasNodeMenuShortcut.ts",
      "features/canvas/hooks/useCanvasNodeMenuShortcut.test.tsx",
      "features/canvas/hooks/useCanvasNodeClickController.ts",
      "features/canvas/hooks/useCanvasNodeClickController.test.tsx",
      "features/canvas/application/canvasNodeMenuSelection.ts",
      "features/canvas/application/canvasNodeMenuSelection.test.ts",
      "features/canvas/hooks/useCanvasNodeMenuSelectionController.ts",
      "features/canvas/hooks/useCanvasNodeMenuSelectionController.test.tsx",
      "features/canvas/hooks/useCanvasQuickAddController.ts",
      "features/canvas/hooks/useCanvasQuickAddController.test.tsx",
      "features/canvas/hooks/useCanvasNodeMenuStateController.ts",
      "features/canvas/hooks/useCanvasNodeMenuStateController.test.tsx",
    ]) {
      expect(
        existsSync(resolve(SRC_ROOT, retiredInteractionPath)),
        retiredInteractionPath,
      ).toBe(false);
    }
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "features/canvas/ui/CanvasMinimapBookmarksOverlayAdapter.tsx",
        ),
      ),
    ).toBe(true);
    for (const file of canvasMainlineDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
    }
    for (const file of canvasMainlineApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
    }
    for (const retiredMainlinePath of [
      "features/canvas/domain/mainlineNodeFlags.ts",
      "__tests__/features/canvas/system-managed-node-data.test.ts",
      "features/canvas/domain/mainlineNodeTypes.ts",
      "features/canvas/domain/inheritMainlineFields.ts",
      "__tests__/features/canvas/inherit-mainline-fields.test.ts",
      "features/canvas/domain/canvasEdgeDeletion.ts",
      "features/canvas/domain/canvasEdgeDeletion.test.ts",
      "features/canvas/application/canvasManagedChangeGuard.ts",
      "features/canvas/application/canvasManagedChangeGuard.test.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredMainlinePath))).toBe(false);
    }
    for (const file of canvasSelectionPresentationFiles) {
      expect(existsSync(resolve(moduleRoot, "presentation", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/hooks", file)),
        file,
      ).toBe(false);
    }
    for (const file of skillDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of generationHistoryDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of generationHistoryApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of generationHistoryInfrastructureFiles) {
      expect(
        existsSync(resolve(moduleRoot, "infrastructure", file)),
        file,
      ).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/infrastructure", file)),
        file,
      ).toBe(false);
    }
    for (const file of generationHistoryPresentationFiles) {
      expect(existsSync(resolve(moduleRoot, "presentation", file)), file).toBe(
        true,
      );
    }
    for (const file of [
      "features/canvas/hooks/useCanvasGenerationHistory.ts",
      "features/canvas/hooks/useNodeGenerationHistory.ts",
      "__tests__/features/canvas/use-canvas-generation-history.test.ts",
      "__tests__/features/canvas/use-node-generation-history.test.tsx",
      "__tests__/features/canvas/history-assets-buckets.test.ts",
      "__tests__/features/canvas/node-generation-history.test.ts",
      "features/canvas/ui/NodeGenerationHistory.tsx",
      "features/canvas/ui/CanvasHistoryAssetCard.tsx",
      "features/canvas/ui/CanvasHistoryAssetCard.test.tsx",
      "features/canvas/application/canvasHistoryAssetSpawn.ts",
      "features/canvas/application/canvasHistoryAssetSpawn.test.ts",
      "features/canvas/hooks/useCanvasHistoryAssetController.ts",
      "features/canvas/hooks/useCanvasHistoryAssetController.test.tsx",
      "features/canvas/hooks/useCanvasHistoryAssetsModalController.ts",
      "features/canvas/hooks/useCanvasHistoryAssetsModalController.test.tsx",
      "features/canvas/ui/CanvasHistoryAssetsModal.tsx",
      "features/canvas/ui/CanvasHistoryAssetsModalView.tsx",
      "features/canvas/ui/CanvasHistoryAssetsModalView.test.tsx",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, file)), file).toBe(false);
    }
    for (const file of generationHistoryCompositionFiles) {
      expect(existsSync(resolve(moduleRoot, file)), file).toBe(true);
    }
    for (const file of beatContextDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of assetLibraryDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/domain", file)),
        file,
      ).toBe(false);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of assetLibraryApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/application", file)),
        file,
      ).toBe(false);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of assetLibraryInfrastructureFiles) {
      expect(
        existsSync(resolve(moduleRoot, "infrastructure", file)),
        file,
      ).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/infrastructure", file)),
        file,
      ).toBe(false);
    }
    for (const file of assetLibraryPresentationFiles) {
      expect(existsSync(resolve(moduleRoot, "presentation", file)), file).toBe(
        true,
      );
    }
    expect(existsSync(resolve(moduleRoot, "assetLibraryComposition.ts"))).toBe(
      true,
    );
    for (const retiredPath of [
      "features/canvas/assetLibraryComposition.ts",
      "features/canvas/hooks/useAssetLibraryModalController.ts",
      "features/canvas/hooks/useAssetLibraryModalController.test.tsx",
      "features/canvas/ui/AssetLibraryModal.tsx",
      "features/canvas/ui/AssetLibraryModalView.tsx",
      "features/canvas/ui/AssetLibraryModalView.test.tsx",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredPath)), retiredPath).toBe(
        false,
      );
    }
    for (const file of mediaTransferDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
    }
    expect(
      existsSync(resolve(SRC_ROOT, "features/canvas/domain/assetDrag.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "features/canvas/ui/NodeReplaceDragPreview.tsx"),
      ),
    ).toBe(false);
    for (const file of toolImageGeometryDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of mediaOperationDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of mediaOperationApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of mediaOperationInfrastructureFiles) {
      expect(
        existsSync(resolve(moduleRoot, "infrastructure", file)),
        file,
      ).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/infrastructure", file)),
        file,
      ).toBe(false);
    }
    expect(
      existsSync(resolve(moduleRoot, "mediaOperationGenerationComposition.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "imageOperationGenerationComposition.ts")),
    ).toBe(false);
    for (const file of textGenerationApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of textGenerationInfrastructureFiles) {
      expect(
        existsSync(resolve(moduleRoot, "infrastructure", file)),
        file,
      ).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/infrastructure", file)),
        file,
      ).toBe(false);
    }
    expect(
      existsSync(resolve(moduleRoot, "textGenerationComposition.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "textGenerationComposition.test.ts")),
    ).toBe(true);
    for (const file of videoStoryApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of videoStoryDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
    }
    for (const file of videoStoryInfrastructureFiles) {
      expect(
        existsSync(resolve(moduleRoot, "infrastructure", file)),
        file,
      ).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/infrastructure", file)),
        file,
      ).toBe(false);
    }
    expect(
      existsSync(resolve(moduleRoot, "videoStoryAnalysisComposition.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "videoStoryAnalysisComposition.test.ts")),
    ).toBe(true);
    for (const file of videoGenerationApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of videoGenerationDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of videoGenerationInfrastructureFiles) {
      expect(
        existsSync(resolve(moduleRoot, "infrastructure", file)),
        file,
      ).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/infrastructure", file)),
        file,
      ).toBe(false);
    }
    expect(
      existsSync(resolve(moduleRoot, "videoGenerationComposition.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "videoGenerationComposition.test.ts")),
    ).toBe(true);
    for (const file of videoComposeApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of videoComposeDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    for (const file of videoComposeInfrastructureFiles) {
      expect(
        existsSync(resolve(moduleRoot, "infrastructure", file)),
        file,
      ).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/infrastructure", file)),
        file,
      ).toBe(false);
    }
    for (const file of videoComposePresentationFiles) {
      expect(existsSync(resolve(moduleRoot, "presentation", file)), file).toBe(
        true,
      );
      const legacyRoot = file === "VideoComposeModal.tsx"
        ? "compose"
        : file.startsWith("VideoCompose")
          ? "ui"
          : file.startsWith("useVideoCompose")
            ? "hooks"
            : "compose";
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas", legacyRoot, file)),
        file,
      ).toBe(false);
    }
    expect(
      existsSync(resolve(moduleRoot, "videoComposeComposition.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "videoComposeComposition.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(SRC_ROOT, "features/canvas/compose/coverCapture.ts")),
    ).toBe(false);
    for (const file of videoSubtitleEraseApplicationFiles) {
      expect(existsSync(resolve(moduleRoot, "application", file)), file).toBe(
        true,
      );
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/application", file)),
        file,
      ).toBe(false);
    }
    for (const file of videoSubtitleEraseDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
    }
    for (const file of videoSubtitleEraseInfrastructureFiles) {
      expect(
        existsSync(resolve(moduleRoot, "infrastructure", file)),
        file,
      ).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/infrastructure", file)),
        file,
      ).toBe(false);
    }
    expect(
      existsSync(resolve(moduleRoot, "videoSubtitleEraseComposition.ts")),
    ).toBe(true);
    expect(
      existsSync(
        resolve(moduleRoot, "videoSubtitleEraseComposition.test.ts"),
      ),
    ).toBe(true);
    for (const file of generationCatalogDomainFiles) {
      expect(existsSync(resolve(moduleRoot, "domain", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/canvas/domain", file)),
        file,
      ).toBe(false);
    }
    expect(
      existsSync(resolve(moduleRoot, "application/generationCatalog.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "generationCatalogComposition.ts")),
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          moduleRoot,
          "infrastructure/httpCanvasGenerationCatalogGateway.ts",
        ),
      ),
    ).toBe(true);
    for (const file of generationCatalogPresentationFiles) {
      expect(existsSync(resolve(moduleRoot, "presentation", file)), file).toBe(
        true,
      );
    }
    for (const retiredGenerationCatalogPath of [
      "features/canvas/application/generationCatalog.ts",
      "features/canvas/catalogComposition.ts",
      "features/canvas/infrastructure/freezoneGenerationCatalogGateway.ts",
      "features/canvas/infrastructure/freezoneGenerationCatalogGateway.test.ts",
      "features/canvas/hooks/useFreezoneCameraOptions.ts",
      "features/canvas/hooks/useFreezoneImageModels.ts",
      "features/canvas/hooks/useFreezoneStyleTemplates.ts",
      "features/canvas/hooks/useFreezoneVideoCameraTemplates.ts",
      "features/canvas/hooks/useFreezoneVideoModels.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredGenerationCatalogPath))).toBe(
        false,
      );
    }
    for (const file of presentationFiles) {
      expect(existsSync(resolve(moduleRoot, "presentation", file)), file).toBe(true);
      expect(
        existsSync(resolve(SRC_ROOT, "features/freezone/presentation", file)),
        file,
      ).toBe(false);
    }
    for (const retiredCanvasMediaPath of [
      "features/canvas/application/videoFileTypes.ts",
      "features/canvas/application/videoFileTypes.test.ts",
      "features/canvas/ui/canvasInteractionTargets.ts",
      "features/canvas/ui/canvasInteractionTargets.test.ts",
      "features/canvas/hooks/useCanvasSpacePan.ts",
      "features/canvas/hooks/useCanvasSpacePan.test.tsx",
      "features/canvas/hooks/useCanvasMarqueeSelection.ts",
      "features/canvas/hooks/useCanvasMarqueeSelection.test.tsx",
      "features/canvas/ui/canvasMediaTransfer.ts",
      "features/canvas/ui/canvasMediaTransfer.test.ts",
      "features/canvas/hooks/useCanvasDropIndicator.ts",
      "features/canvas/hooks/useCanvasDropIndicator.test.tsx",
      "features/canvas/hooks/useCanvasMediaDropController.ts",
      "features/canvas/hooks/useCanvasMediaDropController.test.tsx",
      "features/canvas/hooks/useCanvasMediaPaste.ts",
      "features/canvas/hooks/useCanvasMediaPaste.test.tsx",
      "features/canvas/hooks/useCanvasMediaTransferController.ts",
      "features/canvas/hooks/useCanvasMediaTransferController.test.tsx",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredCanvasMediaPath))).toBe(false);
    }
    for (const retiredProjectPagePath of [
      "features/freezone/hooks/useFreezoneProjectPageController.ts",
      "features/freezone/hooks/useFreezoneProjectPageController.test.tsx",
      "features/freezone/presentation/FreezoneProjectPageView.tsx",
      "features/freezone/presentation/FreezoneProjectPageView.test.tsx",
      "features/freezone/routeComposition.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredProjectPagePath))).toBe(false);
    }
    for (const retiredShellPresentationPath of [
      "features/freezone/FreezoneShell.tsx",
      "features/freezone/hooks/useFreezoneShellController.ts",
      "features/freezone/hooks/useFreezoneShellController.test.tsx",
      "features/freezone/presentation/FreezoneShellView.tsx",
      "features/freezone/presentation/FreezoneShellView.test.tsx",
      "features/freezone/presentation/MaskEditor.tsx",
      "features/freezone/assetLibraryCanvasInsertionComposition.ts",
    ]) {
      expect(
        existsSync(resolve(SRC_ROOT, retiredShellPresentationPath)),
      ).toBe(false);
    }
    for (const retiredCanvasEntryLifecyclePath of [
      "features/freezone/hooks/useFreezoneCanvasEntryLifecycle.ts",
      "features/freezone/hooks/useFreezoneCanvasEntryLifecycle.test.tsx",
    ]) {
      expect(
        existsSync(resolve(SRC_ROOT, retiredCanvasEntryLifecyclePath)),
      ).toBe(false);
    }
    for (const retiredChatDockPath of [
      "features/freezone/hooks/useFreezoneChatDockController.ts",
      "features/freezone/hooks/useFreezoneChatDockController.test.tsx",
      "features/freezone/presentation/FreezoneCanvasFeedback.tsx",
      "features/freezone/presentation/FreezoneCanvasFeedback.test.tsx",
      "features/freezone/presentation/FreezoneChatDock.tsx",
      "features/freezone/presentation/FreezoneChatDock.test.tsx",
      "features/freezone/presentation/FreezoneChatDockView.tsx",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredChatDockPath))).toBe(false);
    }
    for (const retiredCanvasBrowserPath of [
      "features/freezone/presentation/CanvasBrowserView.tsx",
      "features/freezone/presentation/CanvasBrowserView.test.tsx",
      "features/freezone/presentation/CanvasesTab.tsx",
      "features/freezone/presentation/CanvasesTab.test.tsx",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredCanvasBrowserPath))).toBe(false);
    }
    for (const retiredAssetReplacementPath of [
      "features/freezone/hooks/useAssetLibraryReplacementController.ts",
      "features/freezone/hooks/useAssetLibraryReplacementController.test.tsx",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredAssetReplacementPath))).toBe(
        false,
      );
    }
    for (const retiredAssetLibraryPresentationPath of [
      "features/freezone/presentation/AssetLibraryPanel.tsx",
      "features/freezone/presentation/AssetLibraryPanel.test.tsx",
      "features/freezone/presentation/AssetLibraryPanelView.tsx",
      "features/freezone/presentation/AssetLibraryPanelView.test.tsx",
      "features/freezone/presentation/AssetLibraryBeatPanels.tsx",
      "features/freezone/presentation/AssetLibraryBeatPanels.test.tsx",
      "features/freezone/presentation/AssetLibraryAssetCard.tsx",
      "features/freezone/presentation/AssetLibraryAssetCard.test.tsx",
    ]) {
      expect(
        existsSync(resolve(SRC_ROOT, retiredAssetLibraryPresentationPath)),
      ).toBe(false);
    }
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "features/freezone/hooks/useCanvasProjectionCommandController.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "features/freezone/hooks/useCanvasProjectionCommandController.test.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/freezone/hooks/contextQueryHooks.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "features/freezone/hooks/useAssetLibraryCatalogController.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "features/freezone/hooks/useCanvasProjectionStatusLifecycle.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "features/freezone/hooks/useCanvasProjectionStatusLifecycle.test.tsx",
        ),
      ),
    ).toBe(false);
    for (const retiredCanvasStoragePath of [
      "features/canvas/application/freezoneCanvasStorage.ts",
      "features/canvas/application/freezoneCanvasStorage.test.ts",
      "features/canvas/infrastructure/freezoneCanvasStorageGateway.ts",
      "features/canvas/infrastructure/freezoneCanvasStorageGateway.test.ts",
      "features/canvas/hooks/freezoneCanvasQueryHooks.ts",
      "features/freezone/hooks/useCanvasBrowserController.ts",
      "features/freezone/hooks/useCanvasBrowserController.test.tsx",
      "features/freezone/canvasConflictRecoveryComposition.ts",
      "features/freezone/hooks/useCanvasConflictController.ts",
      "features/freezone/hooks/useCanvasConflictController.test.tsx",
      "features/freezone/hooks/useCanvasDraftPersistenceController.ts",
      "features/freezone/hooks/useCanvasDraftPersistenceController.test.tsx",
      "features/freezone/hooks/useCanvasLocalPersistence.ts",
      "features/freezone/hooks/useCanvasLocalPersistence.test.tsx",
      "features/freezone/canvasSaveComposition.ts",
      "features/freezone/canvasUnloadSaveComposition.ts",
      "features/freezone/hooks/useCanvasSaveController.ts",
      "features/freezone/hooks/useCanvasSaveController.test.tsx",
      "features/freezone/canvasHydrationComposition.ts",
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
      "features/freezone/hooks/useCanvasHydrationLifecycle.test.tsx",
      "features/freezone/hooks/useCanvasRuntimeBridge.ts",
      "features/freezone/hooks/useCanvasRuntimeBridge.test.tsx",
      "features/freezone/canvasPresetRefreshComposition.ts",
      "features/freezone/hooks/useCanvasPresetRefreshController.ts",
      "features/freezone/hooks/useCanvasPresetRefreshController.test.tsx",
      "features/freezone/hooks/useCanvasCommitController.ts",
      "features/freezone/hooks/useCanvasCommitController.test.tsx",
      "features/freezone/hooks/useCanvasSync.ts",
      "__tests__/features/freezone/use-canvas-sync.test.tsx",
      "features/canvas/domain/assetDropInfo.ts",
      "features/canvas/domain/canvasCommitEligibility.ts",
      "features/canvas/domain/canvasCommitEligibility.test.ts",
      "features/canvas/domain/directorWorldSceneSaveRegistry.ts",
      "features/canvas/assetDropStore.ts",
      "features/canvas/assetDropStore.test.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredCanvasStoragePath))).toBe(false);
    }
    expect(existsSync(resolve(SRC_ROOT, "features/freezone/hooks"))).toBe(
      false,
    );
    expect(
      existsSync(resolve(SRC_ROOT, "__tests__/features/freezone/canvases-tab.test.ts")),
    ).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "features/freezone/public.ts"))).toBe(
      false,
    );
    for (const retiredContextPath of [
      "features/freezone/context/contextMatching.ts",
      "features/freezone/context/contextOperations.tsx",
      "features/freezone/context/contextPromptCompiler.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, retiredContextPath))).toBe(false);
    }
    expect(importSpecifiers(publicPath)).toEqual(
      expect.arrayContaining([
        "@/modules/creative_canvas/domain/canvasProjection",
        "@/modules/creative_canvas/domain/canvasProjectionRequest",
        "@/modules/creative_canvas/domain/canvasProjectionMetadata",
        "@/modules/creative_canvas/domain/projectionGraphIds",
        "@/modules/creative_canvas/domain/assetCommit",
        "@/modules/creative_canvas/domain/directorWorldCommit",
        "@/modules/creative_canvas/domain/pushTarget",
        "@/modules/creative_canvas/domain/mainlineContext",
        "@/modules/creative_canvas/domain/currentBeatContext",
        "@/modules/creative_canvas/domain/skillContract",
        "@/modules/creative_canvas/domain/skillExecution",
        "@/modules/creative_canvas/domain/skillInputResolution",
        "@/modules/creative_canvas/domain/inferSkillConnectionRole",
        "@/modules/creative_canvas/domain/generationHistoryRecord",
        "@/modules/creative_canvas/domain/canvasAsset",
        "@/modules/creative_canvas/application/generationHistoryAssets",
        "@/modules/creative_canvas/application/canvasHistoryAssetSpawn",
        "@/modules/creative_canvas/presentation/useCanvasGenerationHistory",
        "@/modules/creative_canvas/presentation/useNodeGenerationHistory",
        "@/modules/creative_canvas/presentation/NodeGenerationHistory",
        "@/modules/creative_canvas/presentation/CanvasHistoryAssetCard",
        "@/modules/creative_canvas/presentation/useCanvasHistoryAssetController",
        "@/modules/creative_canvas/presentation/CanvasHistoryAssetsModal",
        "@/modules/creative_canvas/presentation/useCanvasHistoryAssetsModalController",
        "@/modules/creative_canvas/domain/beatContext",
        "@/modules/creative_canvas/domain/assetLibraryModel",
        "@/modules/creative_canvas/domain/assetLibrary",
        "@/modules/creative_canvas/application/assetLibraryProjection",
        "@/modules/creative_canvas/domain/toolImageGeometry",
        "@/modules/creative_canvas/domain/multiAngle",
        "@/modules/creative_canvas/domain/outpaint",
        "@/modules/creative_canvas/domain/redraw",
        "@/modules/creative_canvas/domain/relight",
        "@/modules/creative_canvas/domain/scene360",
        "@/modules/creative_canvas/domain/upscale",
        "@/modules/creative_canvas/domain/cameraMovementPresets",
        "@/modules/creative_canvas/domain/imageModelCapability",
        "@/modules/creative_canvas/domain/videoGenerationMode",
        "@/modules/creative_canvas/domain/videoClipRange",
        "@/modules/creative_canvas/domain/videoComposeTimeline",
        "@/modules/creative_canvas/domain/videoComposeTimelineEdits",
        "@/modules/creative_canvas/domain/videoComposeTimelineGestures",
        "@/modules/creative_canvas/application/videoComposePreview",
        "@/modules/creative_canvas/application/videoComposeTimelineSession",
        "@/modules/creative_canvas/presentation/useVideoComposeTimelineEditorController",
        "@/modules/creative_canvas/presentation/useVideoComposeTimelinePointerController",
        "@/modules/creative_canvas/presentation/useVideoComposeKeyboardController",
        "@/modules/creative_canvas/presentation/useVideoComposePlaybackClock",
        "@/modules/creative_canvas/presentation/VideoComposeTimelineControls",
        "@/modules/creative_canvas/application/generationCatalog",
        "@/modules/creative_canvas/generationCatalogComposition",
        "@/modules/creative_canvas/assetTransferComposition",
        "@/modules/creative_canvas/canvasStorageRetentionComposition",
        "@/modules/creative_canvas/domain/canvasStorageRetention",
        "@/modules/creative_canvas/domain/canvasMutation",
        "@/modules/creative_canvas/application/canvasRuntimeState",
        "@/modules/creative_canvas/application/canvasDraft",
        "@/modules/creative_canvas/application/canvasSyncStorage",
        "@/modules/creative_canvas/application/canvasSyncHydration",
        "@/modules/creative_canvas/application/canvasConflictRecovery",
        "@/modules/creative_canvas/application/canvasProjectionGraph",
        "@/modules/creative_canvas/application/canvasPresetRefresh",
        "@/modules/creative_canvas/application/canvasSaveError",
        "@/modules/creative_canvas/application/canvasSyncCore",
        "@/modules/creative_canvas/canvasSyncHookComposition",
        "@/modules/creative_canvas/application/canvasCommitRules",
        "@/modules/creative_canvas/application/canvasCommitEvents",
        "@/modules/creative_canvas/application/directorWorldSceneSaveRegistry",
        "@/modules/creative_canvas/application/committedNodePatch",
        "@/modules/creative_canvas/application/sceneDirectorWorldCommit",
        "@/modules/creative_canvas/application/directorRenderCommit",
        "@/modules/creative_canvas/directorCommitComposition",
        "@/modules/creative_canvas/canvasCommitControllerComposition",
        "@/modules/creative_canvas/domain/canvasCommitEligibility",
        "@/modules/creative_canvas/domain/canvasCommitSource",
        "@/modules/creative_canvas/projectionComposition",
        "@/modules/creative_canvas/presetProjectionComposition",
        "@/modules/creative_canvas/canvasDraftComposition",
        "@/modules/creative_canvas/canvasSyncComposition",
        "@/modules/creative_canvas/canvasProjectionStatusLifecycleComposition",
        "@/modules/creative_canvas/canvasStorageComposition",
        "@/modules/creative_canvas/canvasBrowserComposition",
        "@/modules/creative_canvas/presentation/skillI18n",
        "@/modules/creative_canvas/presentation/assetLibraryViewModel",
        "@/modules/creative_canvas/presentation/canvasBrowserViewModel",
        "@/modules/creative_canvas/presentation/commitDialogViewModel",
        "@/modules/creative_canvas/presentation/useAssetLibraryReplacementController",
        "@/modules/creative_canvas/presentation/AssetLibraryPanelView",
        "@/modules/creative_canvas/presentation/AssetLibraryModal",
        "@/modules/creative_canvas/presentation/FreezoneChatDock",
        "@/modules/creative_canvas/presentation/FreezoneCanvasFeedback",
        "@/modules/creative_canvas/presentation/CanvasesTab",
        "@/modules/creative_canvas/presentation/CommitDialogView",
        "@/modules/creative_canvas/presentation/CommitDialog",
        "@/modules/creative_canvas/presentation/CompareDialog",
        "@/modules/creative_canvas/presentation/CreateIdentityDialog",
      ]),
    );
  });

  it("establishes AI Assistant domain and application ownership", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/ai_assistant");
    const publicPath = resolve(moduleRoot, "public.ts");

    expect(existsSync(publicPath)).toBe(true);
    expect(existsSync(resolve(moduleRoot, "composition.ts"))).toBe(true);
    expect(existsSync(resolve(moduleRoot, "domain/contracts.ts"))).toBe(true);
    expect(existsSync(resolve(moduleRoot, "domain/scope.ts"))).toBe(true);
    expect(existsSync(resolve(moduleRoot, "domain/scope.test.ts"))).toBe(true);
    expect(existsSync(resolve(moduleRoot, "domain/activeTurn.ts"))).toBe(true);
    expect(existsSync(resolve(moduleRoot, "domain/activeTurn.test.ts"))).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "domain/messagePresentationRules.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "domain/messagePresentationRules.test.ts")),
    ).toBe(true);
    expect(existsSync(resolve(moduleRoot, "domain/message.ts"))).toBe(true);
    expect(existsSync(resolve(moduleRoot, "domain/message.test.ts"))).toBe(true);
    expect(existsSync(resolve(moduleRoot, "domain/structuredContent.ts"))).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "domain/structuredContent.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/panelMessageProjection.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/panelMessageProjection.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/messageTimeline.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/messageTimeline.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/messageProjection.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/messageProjection.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/useFrameController.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/useFrameController.test.tsx")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "application/useIngestAutomationController.ts")),
    ).toBe(true);
    expect(
      existsSync(
        resolve(moduleRoot, "application/useIngestAutomationController.test.tsx"),
      ),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "domain/ingestAutomation.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "domain/ingestAutomation.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/messageCache.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/chatCommands.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/chatCommands.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/ingestAutomationGateway.ts")),
    ).toBe(true);
    expect(
      existsSync(
        resolve(moduleRoot, "infrastructure/ingestAutomationGateway.test.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/ingestUploadStorage.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/ingestUploadStorage.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/messageCache.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/preferencesStorage.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/preferencesStorage.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/activeTurnStorage.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/activeTurnStorage.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/socketSession.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "infrastructure/socketSession.test.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "presentation/timelineScroll.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(moduleRoot, "presentation/timelineScroll.test.ts")),
    ).toBe(true);
    for (const ownedPath of [
      "domain/specMediaProjection.ts",
      "domain/specMediaProjection.test.ts",
      "application/useComposerSubmitController.ts",
      "application/useComposerSubmitController.test.tsx",
      "presentation/useComposerAttachmentsController.ts",
      "presentation/useComposerAttachmentsController.test.tsx",
      "presentation/useComposerBorderBeam.ts",
      "presentation/useComposerBorderBeam.test.tsx",
      "presentation/useComposerHistoryNavigation.ts",
      "presentation/useComposerHistoryNavigation.test.tsx",
      "application/useChatQueueController.ts",
      "application/useChatQueueController.test.tsx",
      "application/useChatSessionController.ts",
      "application/useChatSessionController.test.tsx",
      "presentation/useChatScrollController.ts",
      "presentation/useChatScrollController.test.tsx",
      "presentation/useSpeechInputController.ts",
      "presentation/useSpeechInputController.test.tsx",
      "presentation/taskNotificationLabel.ts",
      "presentation/taskNotificationLabel.test.ts",
      "presentation/useTaskCompletionNotifications.ts",
      "presentation/useTaskCompletionNotifications.test.tsx",
      "presentation/ChatControlBar.tsx",
      "presentation/ChatControlBar.test.tsx",
      "presentation/ChatPanelHeader.tsx",
      "presentation/ChatPanelHeader.test.tsx",
      "presentation/ApprovalCard.tsx",
      "presentation/ApprovalCard.test.tsx",
      "presentation/SearchBar.tsx",
      "presentation/SearchBar.test.tsx",
      "presentation/PinnedPanel.tsx",
      "presentation/PinnedPanel.test.tsx",
      "presentation/StructuredJsonView.tsx",
      "presentation/StructuredJsonView.test.tsx",
      "presentation/ComposerWaitingStatus.tsx",
      "presentation/ComposerWaitingStatus.test.tsx",
      "presentation/QueuedMessagesPanel.tsx",
      "presentation/QueuedMessagesPanel.test.tsx",
      "presentation/ChatPanelContextViews.tsx",
      "presentation/ChatPanelContextViews.test.tsx",
      "presentation/ChatComposer.tsx",
      "presentation/ChatComposer.test.tsx",
      "presentation/useAiAvatarUrl.ts",
      "presentation/SpecMediaModals.tsx",
      "presentation/SpecMediaModals.test.tsx",
      "presentation/SpecMediaGallery.tsx",
      "presentation/SpecMediaGallery.test.tsx",
      "presentation/ChatMessageView.tsx",
      "presentation/ChatMessageView.test.tsx",
      "presentation/MessageDetailPanel.tsx",
      "presentation/MessageDetailPanel.test.tsx",
      "presentation/ChatTimeline.tsx",
      "presentation/ChatTimeline.test.tsx",
      "presentation/ChatMessageArea.tsx",
      "presentation/ChatMessageArea.test.tsx",
      "presentation/ChatPanelDetailOverlays.tsx",
      "presentation/ChatPanelDetailOverlays.test.tsx",
      "presentation/SuperChatPanelView.tsx",
      "presentation/SuperChatPanelView.test.tsx",
      "presentation/SuperChatPanel.tsx",
    ]) {
      expect(existsSync(resolve(moduleRoot, ownedPath)), ownedPath).toBe(true);
    }
    expect(existsSync(resolve(SRC_ROOT, "features/superchat/types.ts"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "features/superchat/scope.ts"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "features/superchat/message.ts"))).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/spec-extract.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/message-timeline.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/message-projection.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/message-cache.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/preferences-storage.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "features/superchat/message-presentation-rules.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "features/superchat/panel-message-projection.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/active-turn.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "__tests__/features/superchat/scope.test.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/spec-extract.test.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/message-timeline.test.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/message-projection.test.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/message-cache.test.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/preferences-storage.test.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "__tests__/features/superchat/message-presentation-rules.test.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/chat-commands.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/chat-commands.test.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/timeline-scroll.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/timeline-scroll.test.ts"),
      ),
    ).toBe(false);
    for (const legacyPath of [
      "features/superchat/ingest-automation-domain.ts",
      "features/superchat/ingest-automation-gateway.ts",
      "features/superchat/ingest-upload-storage.ts",
      "features/superchat/use-ingest-automation-controller.ts",
      "__tests__/features/superchat/ingest-automation-domain.test.ts",
      "__tests__/features/superchat/ingest-automation-gateway.test.ts",
      "__tests__/features/superchat/ingest-upload-storage.test.ts",
      "__tests__/features/superchat/use-ingest-automation-controller.test.tsx",
      "features/superchat/use-composer-attachments-controller.ts",
      "features/superchat/use-composer-border-beam.ts",
      "features/superchat/use-composer-history-navigation.ts",
      "features/superchat/use-composer-submit-controller.ts",
      "__tests__/features/superchat/use-composer-attachments-controller.test.tsx",
      "__tests__/features/superchat/use-composer-border-beam.test.tsx",
      "__tests__/features/superchat/use-composer-history-navigation.test.tsx",
      "__tests__/features/superchat/use-composer-submit-controller.test.tsx",
      "features/superchat/use-chat-queue-controller.ts",
      "features/superchat/use-chat-scroll-controller.ts",
      "features/superchat/use-speech-input-controller.ts",
      "features/superchat/task-notification-label.ts",
      "features/superchat/use-task-completion-notifications.ts",
      "__tests__/features/superchat/use-chat-queue-controller.test.tsx",
      "__tests__/features/superchat/use-chat-scroll-controller.test.tsx",
      "__tests__/features/superchat/use-speech-input-controller.test.tsx",
      "__tests__/features/superchat/task-notification-label.test.ts",
      "__tests__/features/superchat/use-task-completion-notifications.test.tsx",
      "features/superchat/chat-control-bar.tsx",
      "features/superchat/chat-panel-header.tsx",
      "__tests__/features/superchat/chat-control-bar.test.tsx",
      "__tests__/features/superchat/chat-panel-header.test.tsx",
      "features/superchat/approval-card.tsx",
      "__tests__/features/superchat/approval-card.test.tsx",
      "features/superchat/chat-search-bar.tsx",
      "features/superchat/pinned-messages-panel.tsx",
      "features/superchat/structured-json-view.tsx",
      "__tests__/features/superchat/structured-json-view.test.tsx",
      "features/superchat/composer-waiting-status.tsx",
      "features/superchat/queued-messages-panel.tsx",
      "__tests__/features/superchat/composer-waiting-status.test.tsx",
      "__tests__/features/superchat/queued-messages-panel.test.tsx",
      "features/superchat/chat-panel-context-views.tsx",
      "__tests__/features/superchat/chat-panel-context-views.test.tsx",
      "features/superchat/chat-composer.tsx",
      "__tests__/features/superchat/chat-composer.test.tsx",
      "features/superchat/ai-avatar.ts",
      "features/superchat/spec-media-projection.ts",
      "__tests__/features/superchat/spec-media-projection.test.ts",
      "features/superchat/spec-media-modals.tsx",
      "__tests__/features/superchat/spec-media-modals.test.tsx",
      "features/superchat/spec-media-gallery.tsx",
      "__tests__/features/superchat/spec-media-gallery.test.tsx",
      "features/superchat/chat-message-view.tsx",
      "__tests__/features/superchat/chat-message-view.test.tsx",
      "features/superchat/message-detail-panel.tsx",
      "__tests__/features/superchat/panel-secondary-views.test.tsx",
      "features/superchat/chat-timeline.tsx",
      "__tests__/features/superchat/chat-timeline.test.tsx",
      "features/superchat/chat-message-area.tsx",
      "__tests__/features/superchat/chat-message-area.test.tsx",
      "features/superchat/chat-panel-detail-overlays.tsx",
      "__tests__/features/superchat/chat-panel-detail-overlays.test.tsx",
      "features/superchat/superchat-panel-view.tsx",
      "__tests__/features/superchat/superchat-panel-view.test.tsx",
      "features/superchat/use-superchat.ts",
      "features/superchat/superchat-panel.tsx",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, legacyPath)), legacyPath).toBe(false);
    }
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "__tests__/features/superchat/panel-message-projection.test.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/active-turn.test.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/socket-session.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SRC_ROOT, "__tests__/features/superchat/socket-session.test.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/use-frame-controller.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "__tests__/features/superchat/use-frame-controller.test.tsx",
        ),
      ),
    ).toBe(false);
    expect(importSpecifiers(publicPath)).toEqual(
      expect.arrayContaining([
        "@/modules/ai_assistant/application/messageProjection",
        "@/modules/ai_assistant/application/messageTimeline",
        "@/modules/ai_assistant/application/panelMessageProjection",
        "@/modules/ai_assistant/application/useFrameController",
        "@/modules/ai_assistant/application/useComposerSubmitController",
        "@/modules/ai_assistant/application/useChatQueueController",
        "@/modules/ai_assistant/composition",
        "@/modules/ai_assistant/domain/activeTurn",
        "@/modules/ai_assistant/domain/contracts",
        "@/modules/ai_assistant/domain/ingestAutomation",
        "@/modules/ai_assistant/domain/message",
        "@/modules/ai_assistant/domain/messagePresentationRules",
        "@/modules/ai_assistant/domain/scope",
        "@/modules/ai_assistant/domain/structuredContent",
        "@/modules/ai_assistant/infrastructure/activeTurnStorage",
        "@/modules/ai_assistant/infrastructure/chatCommands",
        "@/modules/ai_assistant/infrastructure/messageCache",
        "@/modules/ai_assistant/infrastructure/preferencesStorage",
        "@/modules/ai_assistant/infrastructure/socketSession",
        "@/modules/ai_assistant/presentation/timelineScroll",
        "@/modules/ai_assistant/presentation/useComposerAttachmentsController",
        "@/modules/ai_assistant/presentation/useComposerBorderBeam",
        "@/modules/ai_assistant/presentation/useComposerHistoryNavigation",
        "@/modules/ai_assistant/presentation/useChatScrollController",
        "@/modules/ai_assistant/presentation/useSpeechInputController",
        "@/modules/ai_assistant/presentation/taskNotificationLabel",
        "@/modules/ai_assistant/presentation/useTaskCompletionNotifications",
        "@/modules/ai_assistant/presentation/ChatPanelHeader",
        "@/modules/ai_assistant/presentation/ApprovalCard",
        "@/modules/ai_assistant/presentation/SearchBar",
        "@/modules/ai_assistant/presentation/PinnedPanel",
        "@/modules/ai_assistant/presentation/StructuredJsonView",
        "@/modules/ai_assistant/presentation/ComposerWaitingStatus",
        "@/modules/ai_assistant/presentation/QueuedMessagesPanel",
        "@/modules/ai_assistant/presentation/ChatPanelContextViews",
        "@/modules/ai_assistant/presentation/ChatComposer",
      ]),
    );
  });

  it("establishes Task Execution as the canonical frontend task boundary", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/task_execution");
    const publicPath = resolve(moduleRoot, "public.ts");
    const ownedPaths = [
      "domain/contracts.ts",
      "domain/taskOrigin.ts",
      "domain/taskOrigin.test.ts",
      "domain/taskScope.ts",
      "domain/taskScope.test.ts",
      "domain/taskState.ts",
      "domain/taskState.test.ts",
      "domain/taskTypes.ts",
      "application/taskEventBus.ts",
      "application/taskEventBus.test.ts",
      "application/taskQueryPorts.ts",
      "application/taskStreamPorts.ts",
      "composition.ts",
      "infrastructure/httpTaskQueryGateway.ts",
      "infrastructure/httpTaskQueryGateway.test.ts",
      "infrastructure/taskCompletionMonitor.ts",
      "infrastructure/taskCompletionMonitor.test.ts",
      "infrastructure/taskStreamClient.ts",
      "infrastructure/taskStreamClient.test.ts",
      "presentation/TaskCenterProvider.tsx",
      "presentation/taskCenterStore.ts",
      "presentation/taskErrorMessage.ts",
      "presentation/taskEventBusContext.ts",
      "presentation/taskOriginLink.ts",
      "presentation/taskOriginLink.test.ts",
      "presentation/taskQueryHooks.ts",
      "presentation/useTaskSubscribe.ts",
      "public.ts",
    ];
    const legacyPaths = [
      "task-center/types.ts",
      "task-center/derivations.ts",
      "task-center/event-bus.ts",
      "task-center/event-bus-context.ts",
      "task-center/task-monitor.ts",
      "task-center/matchers.ts",
      "task-center/provider.tsx",
      "task-center/public.ts",
      "task-center/query-hooks.ts",
      "task-center/store.ts",
      "task-center/stream-client.ts",
      "task-center/task-errors.ts",
      "task-center/use-task-subscribe.ts",
      "types/task.ts",
      "lib/task-scope.ts",
      "lib/task-scope.test.ts",
      "lib/task-types.ts",
      "__tests__/task-center/derivations.test.ts",
      "__tests__/task-center/event-bus.test.ts",
      "__tests__/task-center/matchers.test.ts",
      "__tests__/task-center/stream-client.test.ts",
    ];

    for (const path of ownedPaths) {
      expect(existsSync(resolve(moduleRoot, path)), path).toBe(true);
    }
    for (const path of legacyPaths) {
      expect(existsSync(resolve(SRC_ROOT, path)), path).toBe(false);
    }
    expect(sourceFiles(resolve(SRC_ROOT, "task-center"))).toEqual([]);
    expect(sourceFiles(moduleRoot).length).toBe(ownedPaths.length);
    expect(importSpecifiers(publicPath)).toEqual(
      expect.arrayContaining([
        "@/modules/task_execution/domain/contracts",
        "@/modules/task_execution/domain/taskOrigin",
        "@/modules/task_execution/domain/taskScope",
        "@/modules/task_execution/domain/taskState",
        "@/modules/task_execution/domain/taskTypes",
        "@/modules/task_execution/application/taskEventBus",
        "@/modules/task_execution/application/taskQueryPorts",
        "@/modules/task_execution/composition",
        "@/modules/task_execution/infrastructure/taskCompletionMonitor",
        "@/modules/task_execution/presentation/taskCenterStore",
        "@/modules/task_execution/presentation/taskErrorMessage",
        "@/modules/task_execution/presentation/taskEventBusContext",
        "@/modules/task_execution/presentation/taskOriginLink",
        "@/modules/task_execution/presentation/taskQueryHooks",
        "@/modules/task_execution/presentation/useTaskSubscribe",
      ]),
    );

    const queryHooksSource = readFileSync(
      resolve(moduleRoot, "presentation/taskQueryHooks.ts"),
      "utf8",
    );
    const providerSource = readFileSync(
      resolve(moduleRoot, "presentation/TaskCenterProvider.tsx"),
      "utf8",
    );
    const gatewaySource = readFileSync(
      resolve(moduleRoot, "infrastructure/httpTaskQueryGateway.ts"),
      "utf8",
    );
    expect(queryHooksSource).not.toContain("@/shared/api/");
    expect(providerSource).not.toContain("@/shared/api/transport");
    expect(providerSource).toContain("gateway.listProjectTasks(projectId, signal)");
    expect(gatewaySource).toContain("@/shared/api/transport");

    const privateBypasses = sourceFiles(SRC_ROOT)
      .filter(
        (path) =>
          !relativeSource(path).startsWith("modules/task_execution/"),
      )
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier.startsWith("@/modules/task_execution/") &&
              specifier !== "@/modules/task_execution/public",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      );
    expect(privateBypasses).toEqual([]);
  });

  it("only allows the measured legacy feature roots to shrink", () => {
    const measuredMaximums = new Map([
      ["features/canvas", 395],
      ["features/freezone", 0],
      ["features/superchat", 0],
      ["task-center", 0],
    ]);

    for (const [root, maximum] of measuredMaximums) {
      expect(sourceFiles(resolve(SRC_ROOT, root)).length, root).toBeLessThanOrEqual(
        maximum,
      );
    }
  });

  it("tracks every remaining legacy Canvas URL reader", () => {
    const readers = sourceFiles(resolve(SRC_ROOT, "features/canvas"))
      .filter((path) => !/\.test\.(ts|tsx)$/.test(path))
      .map((path) => ({
        path: relativeSource(path),
        calls: readFileSync(path, "utf8").match(/readUrl\(\)/g)?.length ?? 0,
      }))
      .filter(({ calls }) => calls > 0)
      .sort((left, right) => left.path.localeCompare(right.path));

    expect(readers).toEqual([]);
  });

  it("removes all legacy Freezone public consumers", () => {
    const productionFiles = sourceFiles(SRC_ROOT).filter(
      (path) =>
        !path.includes("__tests__") && !/\.(test|spec)\.(ts|tsx)$/.test(path),
    );
    const imports = productionFiles.flatMap((path) =>
      importSpecifiers(path)
        .filter((specifier) => specifier === "@/features/freezone/public")
        .map(() => relativeSource(path)),
    );

    expect(new Set(imports).size).toBe(0);
    expect(imports.length).toBe(0);
  });

  it("does not add consumers of legacy Canvas, Freezone, or SuperChat internals", () => {
    const allowed = new Set([
      "app/creative-canvas-shell-composition.tsx: @/features/canvas/Canvas",
      "app/creative-canvas-shell-composition.tsx: @/features/canvas/canvasStore",
      "app/creative-canvas-shell-composition.tsx: @/features/canvas/composition",
      "app/creative-canvas-shell-composition.tsx: @/features/canvas/domain/canvasNodes",
    ]);
    const roots = ["app", "components", "modules", "routes"];
    const actual = roots.flatMap((root) =>
      sourceFiles(resolve(SRC_ROOT, root)).flatMap((path) =>
        importSpecifiers(path)
          .filter((specifier) =>
            /^@\/features\/(canvas|freezone|superchat)(\/|$)/.test(specifier),
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      ),
    );

    expect(actual.sort()).toEqual([...allowed].sort());
  });

  it("keeps Canvas infrastructure independent from routes and Freezone features", () => {
    const gateway = readFileSync(
      resolve(SRC_ROOT, "features/canvas/infrastructure/freezoneAiGateway.ts"),
      "utf8",
    );

    expect(gateway.match(/readUrl\(\)/g)?.length ?? 0).toBe(0);
    expect(
      importSpecifiers(
        resolve(SRC_ROOT, "features/canvas/infrastructure/freezoneAiGateway.ts"),
      ).filter((specifier) => specifier === "@/features/freezone/public").length,
    ).toBe(0);
  });

  it("uses the authenticated catalog as the only Canvas model source", () => {
    const modelRoot = resolve(SRC_ROOT, "features/canvas/models");
    const productionModelFiles = sourceFiles(modelRoot)
      .filter((path) => !/\.test\.(ts|tsx)$/.test(path))
      .map(relativeSource)
      .sort();
    const catalogConsumers = [
      "features/canvas/models/registry.ts",
      "modules/creative_canvas/presentation/useCanvasImageModels.ts",
      "modules/creative_canvas/presentation/useCanvasVideoModels.ts",
    ].map((path) => readFileSync(resolve(SRC_ROOT, path), "utf8"));

    expect(productionModelFiles).toEqual([
      "features/canvas/models/index.ts",
      "features/canvas/models/registry.ts",
      "features/canvas/models/types.ts",
    ]);
    for (const source of catalogConsumers) {
      for (const forbidden of [
        "fallbackModels",
        "isFallback",
        "gpt-image-1",
        "nano-banana-pro",
        "openrouter/",
        "huimeng",
      ]) {
        expect(source, forbidden).not.toContain(forbidden);
      }
    }
  });

  it("does not persist the removed renderer Provider API-key map", () => {
    const settings = readFileSync(
      resolve(SRC_ROOT, "stores/settingsStore.ts"),
      "utf8",
    );

    for (const removedSymbol of [
      "ProviderApiKeys",
      "setProviderApiKey",
      "hasConfiguredApiKey",
      "getConfiguredApiKeyCount",
    ]) {
      expect(settings, removedSymbol).not.toContain(removedSymbol);
    }
  });

  it("keeps secrets and generic network capabilities out of the renderer bridge", () => {
    const preload = readFileSync(resolve(DESKTOP_ROOT, "src/preload.cts"), "utf8");
    const exposedObject = preload.slice(
      preload.indexOf('contextBridge.exposeInMainWorld("aiAnimeDesktop"'),
    );

    for (const forbidden of [
      "accessToken",
      "privateKey",
      "payloadJson",
      "rawRequest:",
      "request:",
      "fetch:",
    ]) {
      expect(exposedObject, forbidden).not.toContain(forbidden);
    }
  });
});
