// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("ImageGenNode director combined world entry", () => {
  it("passes a combined capture handler so preset director assets can export bundles", () => {
    const controllerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/canvas/hooks/useImageGenNodeController.ts",
      ),
      "utf8",
    );
    const viewSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/nodes/ImageGenNodeView.tsx"),
      "utf8",
    );

    expect(controllerSource).toContain("handleDirectorCaptureCombined");
    expect(viewSource).toContain("onSubmitDirectorCombined={handleDirectorCaptureCombined}");
    expect(viewSource).not.toContain("onCaptureCanvasNode={handleDirectorCaptureCombined}");
    expect(controllerSource).toContain("controlFrameBundle");
  });

  it("does not expose selected-background capture from the director-combined entry", () => {
    const viewSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/nodes/ImageGenNodeView.tsx"),
      "utf8",
    );

    expect(viewSource).not.toContain("onCaptureSelectedBackground={handleDirectorCaptureSelectedBackground}");
  });

  it("lets dragged director bundle upload nodes open Director World", () => {
    const modelSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/application/uploadNodeModel.ts"),
      "utf8",
    );
    const controllerSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/hooks/useUploadNodeController.ts"),
      "utf8",
    );
    const viewSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/nodes/UploadNodeView.tsx"),
      "utf8",
    );

    expect(controllerSource).toContain("getCanvasBeatDirectorManifest");
    expect(modelSource).toContain("role === 'director_combined'");
    expect(viewSource).toContain("onSubmitDirectorCombined={controller.submitDirectorCombined}");
    expect(viewSource).toContain("onCaptureCanvasNode={controller.captureDirectorCanvasNode}");
    expect(controllerSource).not.toContain("autoCommitDirectorCombined");
    expect(controllerSource).toContain("meta.captureBundle");
    expect(controllerSource).toContain("label: '导演合成图'");
    expect(controllerSource).toContain("label: '纯背景图'");
    expect(controllerSource).toContain("addPanoCaptureGroup");
    expect(controllerSource).toContain("kind: 'director_render'");
    expect(controllerSource).not.toContain("freezone/assets-updated");
  });

  it("exports both combined and env_only from normal Director World canvas output", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/canvas/hooks/useThreeDWorldNodeController.ts"),
      "utf8",
    );

    expect(source).toContain("meta.captureBundle");
    expect(source).toContain("label: '导演合成图'");
    expect(source).toContain("label: '纯背景图'");
    expect(source).toContain("director_control_bundle");
  });

  it("guards Director World canvas output against duplicate in-flight group creation", () => {
    const threeDWorldSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/hooks/useThreeDWorldNodeController.ts"),
      "utf8",
    );
    const uploadSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/hooks/useUploadNodeController.ts"),
      "utf8",
    );

    expect(threeDWorldSource).toContain("captureCanvasNodeBusyRef");
    expect(uploadSource).toContain("captureCanvasNodeBusyRef");
  });

  it("restores the bundle source when opening Director World from a dragged upload node", () => {
    const modelSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/application/uploadNodeModel.ts"),
      "utf8",
    );
    const controllerSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/hooks/useUploadNodeController.ts"),
      "utf8",
    );
    const viewSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/nodes/UploadNodeView.tsx"),
      "utf8",
    );

    expect(controllerSource).toContain("directorControlBundleSourceId");
    expect(controllerSource).toContain("active_source_id: directorControlBundleSourceId");
    expect(modelSource).toContain("sceneSnapshotFromDirectorControlBundle");
    expect(viewSource).toContain("initialScene={controller.directorInitialScene}");
  });

  it("only writes beat bundles directly in mainline commit mode", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/viewer-kit/three-d/ThreeDDirectorDialog.tsx"),
      "utf8",
    );

    expect(source).toContain("autoCommitDirectorCombined &&");
    expect(source).toContain("DIRECTOR_CONTROL_FRAME_MAX_LONG_EDGE");
  });
});
