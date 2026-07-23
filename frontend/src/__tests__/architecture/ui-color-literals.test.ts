import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");
const COLOR_LITERAL_PATTERN =
  /#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla|oklch|oklab)\([^)]*\)/g;

const COLOR_LITERAL_MAX: Record<string, number> = {
  "api/ops.ts": 2,
  "app/styles/base.css": 34,
  "app/styles/portal-overrides.css": 81,
  "app/styles/themes.css": 122,
  "app/styles/tokens.css": 9,
  "commands/image.ts": 2,
  "components/credits/credit-visual.tsx": 6,
  "components/episode/beat-workbench/beat-card.tsx": 2,
  "components/episode/beat-workbench/media-styles.ts": 1,
  "components/episode/beat-workbench/render-section.tsx": 1,
  "components/episode/beat-workbench/sketch-crop-dialog.tsx": 1,
  "components/episode/beat-workbench/sketch-pose-editor-dialog.tsx": 9,
  "components/episode/beat-workbench/video-pane.tsx": 5,
  "components/layout/header.tsx": 3,
  "components/login-page.tsx": 1,
  "components/notifications/notification-drawer.tsx": 1,
  "components/projects/project-folder.module.css": 3,
  "components/projects/project-folder.tsx": 3,
  "components/ui/primitives.tsx": 6,
  "features/canvas/application/toolProcessor.ts": 2,
  "features/canvas/Canvas.tsx": 1,
  "features/canvas/compose/VideoComposeModal.tsx": 6,
  "features/canvas/domain/groupColors.ts": 9,
  "features/canvas/domain/nodeRegistry.ts": 2,
  "features/canvas/edges/DisconnectableEdge.tsx": 13,
  "features/canvas/nodes/AudioOperationsPanel.tsx": 1,
  "features/canvas/nodes/BeatContextNode.tsx": 24,
  "features/canvas/nodes/CameraMovementPickerPopover.tsx": 4,
  "features/canvas/nodes/contextPromptPalette.ts": 22,
  "features/canvas/nodes/ContextPromptPaletteButton.tsx": 2,
  "features/canvas/nodes/GroupNode.tsx": 1,
  "features/canvas/nodes/ImageEditNode.tsx": 7,
  "features/canvas/nodes/ImageGenNode.tsx": 13,
  "features/canvas/nodes/ImageNode.tsx": 3,
  "features/canvas/nodes/Pano360ViewerNode.tsx": 5,
  "features/canvas/nodes/ScriptNode.tsx": 1,
  "features/canvas/nodes/shared/ReferenceTextChip.tsx": 1,
  "features/canvas/nodes/StoryboardGenNode.tsx": 2,
  "features/canvas/nodes/StoryboardNode.tsx": 4,
  "features/canvas/nodes/StylePickerPopover.tsx": 1,
  "features/canvas/nodes/ThreeDWorldNode.tsx": 2,
  "features/canvas/nodes/UploadNode.tsx": 4,
  "features/canvas/nodes/VideoClipPanel.tsx": 2,
  "features/canvas/nodes/VideoNode.tsx": 18,
  "features/canvas/nodes/VoiceSelectionModal.tsx": 14,
  "features/canvas/snap-align/SnapAlignGuides.tsx": 2,
  "features/canvas/tools/annotation/codec.ts": 4,
  "features/canvas/tools/builtInTools.ts": 1,
  "features/canvas/ui/AudioWaveformPlayer.tsx": 2,
  "features/canvas/ui/BackgroundCropperDialog.tsx": 3,
  "features/canvas/ui/CanvasHistoryAssetsModal.tsx": 2,
  "features/canvas/ui/DirectorControlBundleBadge.tsx": 1,
  "features/canvas/ui/EraseOverlay.tsx": 10,
  "features/canvas/ui/ImageViewerModal.tsx": 1,
  "features/canvas/ui/LightEditorPanel.tsx": 22,
  "features/canvas/ui/ModelParamsControls.tsx": 6,
  "features/canvas/ui/multi-angle-sphere.css": 17,
  "features/canvas/ui/MultiSelectionConnectButton.tsx": 1,
  "features/canvas/ui/NodeActionToolbar.tsx": 5,
  "features/canvas/ui/NodeGenerationHistory.tsx": 4,
  "features/canvas/ui/NodeHeader.tsx": 5,
  "features/canvas/ui/NodePriceBadge.tsx": 1,
  "features/canvas/ui/NodeReplaceDragPreview.tsx": 2,
  "features/canvas/ui/NodeSpawnPlusOverlay.tsx": 1,
  "features/canvas/ui/OutpaintEditorOverlay.tsx": 1,
  "features/canvas/ui/pan-shortcut-icons.tsx": 14,
  "features/canvas/ui/RedrawOverlay.tsx": 10,
  "features/canvas/ui/tool-editors/AnnotateToolEditor.tsx": 5,
  "features/canvas/ui/tool-editors/CropToolEditor.tsx": 1,
  "features/canvas/ui/tool-editors/SplitStoryboardToolEditor.tsx": 7,
  "features/canvas/ui/VideoViewerModal.tsx": 6,
  "features/freezone/AssetLibraryPanel.tsx": 13,
  "features/freezone/commit/CommitDialog.tsx": 1,
  "features/freezone/context/NodeContextBadges.tsx": 3,
  "features/freezone/FreezoneShell.tsx": 1,
  "features/superchat/superchat-panel.tsx": 5,
  "features/version-update/VersionUpdateDialog.tsx": 1,
  "features/viewer-kit/pano/PanoCaptureSurface.tsx": 1,
  "features/viewer-kit/three-d/engine/viewerApp.ts": 9,
  "features/viewer-kit/three-d/ThreeDDirectorDialog.tsx": 43,
  "features/viewer-kit/three-d/ThreeDStageCanvas.tsx": 4,
  "lib/dom-reconciliation-guard.ts": 1,
  "lib/project-cover.ts": 24,
  "lib/sketch-colors.ts": 1,
  "pipeline-import/CompareDialog.tsx": 1,
  "pipeline-import/MaskEditor.tsx": 4,
  "routes/_app/index.tsx": 2,
  "stores/canvasStore.ts": 2,
  "stores/settingsStore.ts": 2,
  "types/script.ts": 1,
};

const DOMAIN_COLOR_DATA = new Set([
  "commands/image.ts",
  "features/canvas/domain/groupColors.ts",
  "features/canvas/domain/nodeRegistry.ts",
  "features/canvas/nodes/contextPromptPalette.ts",
  "lib/project-cover.ts",
  "lib/sketch-colors.ts",
  "types/script.ts",
]);

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return sourceFiles(path);
    }
    if (!/\.(css|ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\./.test(entry.name) || entry.name === "routeTree.gen.ts") {
      return [];
    }
    return [path];
  });
}

function category(path: string): string {
  if (path === "app/styles/themes.css" || path === "app/styles/tokens.css") {
    return "theme-source";
  }
  if (DOMAIN_COLOR_DATA.has(path)) return "domain-color-data";
  if (
    path.startsWith("features/viewer-kit/") ||
    path.startsWith("features/canvas/tools/") ||
    path.endsWith("Overlay.tsx") ||
    path.endsWith("engine/viewerApp.ts")
  ) {
    return "media-renderer";
  }
  return "legacy-ui-chrome";
}

describe("UI color literal boundary", () => {
  it("does not add unclassified or additional hard-coded colors", () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const path = relative(SRC_ROOT, file).replace(/\\/g, "/");
      const count = readFileSync(file, "utf8").match(COLOR_LITERAL_PATTERN)?.length ?? 0;
      if (count === 0) continue;

      const allowed = COLOR_LITERAL_MAX[path];
      if (allowed === undefined) {
        violations.push(`${path}: ${count} unclassified color literal(s)`);
      } else if (count > allowed) {
        violations.push(`${path} [${category(path)}]: ${count} > ${allowed}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
