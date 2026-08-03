import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");
const COLOR_LITERAL_PATTERN =
  /#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla|oklch|oklab)\([^)]*\)/g;

const COLOR_LITERAL_MAX: Record<string, number> = {
  "app/styles/base.css": 34,
  "app/styles/portal-overrides.css": 81,
  "app/styles/themes.css": 126,
  "app/styles/tokens.css": 9,
  "commands/image.ts": 2,
  "components/credits/credit-visual.tsx": 6,
  "modules/production/presentation/Seedance2AssetCropDialog.tsx": 1,
  "modules/production/presentation/RenderSectionView.tsx": 1,
  "modules/production/presentation/SketchCropDialogView.tsx": 1,
  "modules/production/presentation/SketchPoseEditorDialogView.tsx": 9,
  "modules/project_workspace/presentation/components/project-folder.module.css": 3,
  "modules/project_workspace/presentation/components/project-folder.tsx": 3,
  "features/canvas/application/storyboardNodeModel.ts": 2,
  "features/canvas/application/toolProcessor.ts": 2,
  "features/canvas/application/uploadNodeModel.ts": 1,
  "features/canvas/Canvas.tsx": 1,
  "modules/creative_canvas/domain/groupColors.ts": 9,
  "features/canvas/domain/nodeRegistry.ts": 2,
  "features/canvas/edges/DisconnectableEdge.tsx": 13,
  "modules/creative_canvas/presentation/useCanvasNodeMenuStateController.ts": 1,
  "features/canvas/infrastructure/browserToolImageGateway.ts": 2,
  "modules/creative_canvas/infrastructure/freezoneVideoComposeGateway.ts": 1,
  "modules/creative_canvas/infrastructure/browserStoryboardExportRuntime.ts": 2,
  "features/canvas/infrastructure/browserStoryboardGenRuntime.ts": 2,
  "features/canvas/nodes/BeatContextNodeView.tsx": 22,
  "features/canvas/nodes/contextPromptPalette.ts": 22,
  "features/canvas/nodes/VideoNodeView.tsx": 6,
  "features/canvas/nodes/VideoPlayerControls.tsx": 4,
  "features/canvas/nodes/VideoReferenceMedia.tsx": 2,
  "modules/creative_canvas/presentation/CanvasSnapAlignGuides.tsx": 2,
  "features/canvas/tools/annotation/codec.ts": 4,
  "features/canvas/tools/builtInTools.ts": 1,
  "features/canvas/ui/AudioWaveformPlayer.tsx": 2,
  "features/canvas/ui/BackgroundCropperDialog.tsx": 2,
  "features/canvas/ui/EraseOverlay.tsx": 10,
  "features/canvas/ui/LightEditorPanel.tsx": 19,
  "features/canvas/ui/ModelParamsControls.tsx": 6,
  "features/canvas/ui/multi-angle-sphere.css": 17,
  "features/canvas/ui/NodeHeader.tsx": 4,
  "modules/creative_canvas/presentation/VideoComposeTrackRow.tsx": 5,
  "features/canvas/ui/OutpaintEditorOverlay.tsx": 1,
  "features/canvas/ui/pan-shortcut-icons.tsx": 14,
  "features/canvas/ui/RedrawOverlay.tsx": 9,
  "features/canvas/ui/tool-editors/AnnotateToolEditor.tsx": 4,
  "features/canvas/ui/tool-editors/SplitStoryboardToolEditor.tsx": 4,
  "modules/creative_canvas/presentation/VideoViewerModal.tsx": 4,
  "features/viewer-kit/pano/PanoCaptureSurface.tsx": 1,
  "features/viewer-kit/three-d/engine/viewerApp.ts": 9,
  "features/viewer-kit/three-d/ThreeDDirectorDialog.tsx": 26,
  "lib/project-cover.ts": 24,
  "lib/sketch-colors.ts": 1,
  "modules/creative_canvas/presentation/CompareDialog.tsx": 1,
  "modules/creative_canvas/presentation/useMaskEditorController.ts": 4,
  "features/canvas/canvasStore.ts": 2,
  "stores/settingsStore.ts": 2,
};

const DOMAIN_COLOR_DATA = new Set([
  "commands/image.ts",
  "features/canvas/application/storyboardNodeModel.ts",
  "features/canvas/application/toolProcessor.ts",
  "features/canvas/application/uploadNodeModel.ts",
  "features/canvas/canvasStore.ts",
  "modules/creative_canvas/domain/groupColors.ts",
  "features/canvas/domain/nodeRegistry.ts",
  "modules/creative_canvas/presentation/useCanvasNodeMenuStateController.ts",
  "features/canvas/nodes/contextPromptPalette.ts",
  "lib/project-cover.ts",
  "lib/sketch-colors.ts",
  "modules/creative_canvas/infrastructure/freezoneVideoComposeGateway.ts",
  "stores/settingsStore.ts",
]);

const DOMAIN_VISUALIZATIONS = new Set([
  "components/credits/credit-visual.tsx",
  "modules/project_workspace/presentation/components/project-folder.module.css",
  "modules/project_workspace/presentation/components/project-folder.tsx",
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

function category(path: string): string | null {
  if (path.startsWith("app/styles/")) {
    return "theme-source";
  }
  if (DOMAIN_COLOR_DATA.has(path)) return "domain-color-data";
  if (DOMAIN_VISUALIZATIONS.has(path)) return "domain-visualization";
  if (
    path.startsWith("modules/production/presentation/") ||
    path.startsWith("modules/creative_canvas/presentation/") ||
    path === "modules/creative_canvas/infrastructure/browserStoryboardExportRuntime.ts" ||
    path.startsWith("features/canvas/") ||
    path.startsWith("features/freezone/presentation/") ||
    path.startsWith("features/viewer-kit/") ||
    path.endsWith("Overlay.tsx")
  ) {
    return "media-renderer";
  }
  return null;
}

describe("UI color literal boundary", () => {
  it("does not add unclassified or additional hard-coded colors", () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const path = relative(SRC_ROOT, file).replace(/\\/g, "/");
      const count = readFileSync(file, "utf8").match(COLOR_LITERAL_PATTERN)?.length ?? 0;
      if (count === 0) continue;

      const allowed = COLOR_LITERAL_MAX[path];
      const colorCategory = category(path);
      if (allowed === undefined || colorCategory === null) {
        violations.push(`${path}: ${count} unclassified color literal(s)`);
      } else if (count > allowed) {
        violations.push(`${path} [${colorCategory}]: ${count} > ${allowed}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
