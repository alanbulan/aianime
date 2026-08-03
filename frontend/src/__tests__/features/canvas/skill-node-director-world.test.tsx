// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const entrySource = readFileSync(
  resolve(process.cwd(), "src/features/canvas/nodes/SkillNode.tsx"),
  "utf8",
);
const modelSource = readFileSync(
  resolve(process.cwd(), "src/features/canvas/application/skillNodeModel.ts"),
  "utf8",
);
const controllerSource = readFileSync(
  resolve(process.cwd(), "src/features/canvas/hooks/useSkillNodeController.ts"),
  "utf8",
);
const viewSource = readFileSync(
  resolve(process.cwd(), "src/features/canvas/nodes/SkillNodeView.tsx"),
  "utf8",
);
const mainlineFlagsSource = readFileSync(
  resolve(process.cwd(), "src/modules/creative_canvas/domain/mainlineNodeFlags.ts"),
  "utf8",
);
const canvasCss = readFileSync(
  resolve(process.cwd(), "src/app/styles/portal-overrides.css"),
  "utf8",
);

describe("SkillNode director world entry", () => {
  it("keeps director world entry scoped to director-combined actions", () => {
    expect(controllerSource).toContain("openContextDirectorWorld");
    expect(viewSource).toContain("openContextDirectorWorld('director_combined')");
    expect(viewSource).not.toContain("openContextDirectorWorld('selected_background')");
    expect(viewSource).not.toContain("PanoCaptureDialog");
    expect(controllerSource).not.toContain("handleOpenPanoCapture");
    expect(controllerSource).not.toContain("handleOpenDirectorStage");
  });

  it("lets selected-background crop director background with the same flat-source cropper as master and reverse", () => {
    expect(viewSource).toContain("pickFlatSource('director_background')");
    expect(viewSource).toContain("pickFlatSource('master')");
    expect(viewSource).toContain("pickFlatSource('reverse')");
    expect(viewSource).toContain("t('viewer.threeD.cropDirectorBackground')");
    expect(viewSource).toContain("t('viewer.threeD.cropDirectorBackgroundDetail',");
    expect(modelSource).toContain("export const SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS = ['2:3', '16:9'] as const");
    expect(viewSource).toContain("aspectOptions={SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS}");
    expect(controllerSource).not.toContain("handleUseDirectorEnvOnly");
    expect(viewSource).not.toContain("t('viewer.threeD.useEnvDirectly')");
  });

  it("keeps director-combined materialization compatible with mainline context validation", () => {
    expect(controllerSource).toContain("satisfies MainlineContext");
    expect(controllerSource).toContain("projectId,");
  });

  it("clears director-world destination after capture failures", () => {
    expect(controllerSource).toMatch(/finally\s*{[\s\S]*setDirectorWorldDestination\(null\);[\s\S]*}/);
  });

  it("uses translation keys for selected-background source labels", () => {
    expect(viewSource).toContain("t('viewer.threeD.currentBackgroundSource')");
    expect(viewSource).toContain("t('viewer.threeD.savedEnvOnlyBackground')");
    expect(viewSource).not.toContain(">当前背景来源<");
    expect(viewSource).not.toContain(">下游当前背景<");
  });

  it("injects the scene pano source into contextual director-world manifests", () => {
    expect(modelSource).toContain("directorManifestWithScenePanoSource");
    expect(modelSource).toContain("assets.pano_360_url");
    expect(modelSource).toContain("scene_director_pano_360");
    expect(controllerSource).toMatch(/setDirectorStageManifest\(\s*mergeSkillManifestWithBeatContext\(\s*directorManifestWithScenePanoSource/);
  });

  it("treats only director-combined captures as committed control-frame bundles", () => {
    expect(viewSource).toContain("autoCommitDirectorCombined");
    expect(viewSource).toContain("onSubmitDirectorCombined");
    expect(controllerSource).toContain("director_control_bundle");
    expect(controllerSource).not.toContain("syncDirectorEnvOnlyToSelectedBackground");
    expect(controllerSource).toContain("uploadAndStageSelectedBackground(");
    expect(controllerSource).toContain("committed: true");
    expect(modelSource).toContain("meta?.controlFrameBundle");
  });

  it("only enables director-combined auto commit for mainline-managed skill nodes", () => {
    expect(controllerSource).toContain("mainlineManaged");
    expect(controllerSource).toContain("isSystemManagedNodeData(data)");
    expect(mainlineFlagsSource).toContain("projection_key");
    expect(mainlineFlagsSource).toContain("user_spawned");
    expect(viewSource).toContain("autoCommitDirectorCombined={mainlineManaged}");
    expect(viewSource).not.toContain("\n          autoCommitDirectorCombined\n");
  });

  it("loads fresh env-only assets for director background crop", () => {
    expect(controllerSource).toContain("ensureSceneAssets(kind === 'director_background')");
    expect(controllerSource).not.toContain("response.ok || !response.data");
    expect(controllerSource).toContain("directorEnvOnlyPreviewUrl");
  });

  it("keeps dynamic skill input handles visible despite the global canvas handle hiding rule", () => {
    expect(viewSource).toContain("skill-node-input-handle");
    expect(canvasCss).toContain(".react-flow__handle.skill-node-input-handle");
    expect(canvasCss).toContain("opacity: 1 !important");
    expect(canvasCss).toContain("pointer-events: auto");
  });

  it("derives contextual identity and prop handles from the unified current BeatContextNode view", () => {
    expect(modelSource).toContain("getCurrentBeatContextFromNode");
    expect(modelSource).toContain("beatContext?.detected_identities");
    expect(modelSource).toContain("beatContext?.detected_props");
    expect(viewSource).toContain("renderContextReferenceRow");
    expect(viewSource).toContain("t('viewer.threeD.skillInputFromBeatContext')");
    expect(modelSource).not.toContain("snapshot.detectedIdentities");
    expect(modelSource).not.toContain("snapshot.detectedProps");
  });

  it("renders explicit no-character and no-prop BeatContext sentinels as semantic empty states", () => {
    expect(modelSource).toContain("noCharacter");
    expect(modelSource).toContain("noProp");
    expect(viewSource).toContain("t('viewer.threeD.skillInputNoCharacter'");
    expect(viewSource).toContain("t('viewer.threeD.skillInputNoProp'");
    expect(modelSource).toContain("__NO_CHARACTER__");
    expect(modelSource).toContain("__NO_PROP__");
  });

  it("keeps the registered entry as the real controller and view composition root", () => {
    expect(entrySource).toContain("useSkillNodeController(props)");
    expect(entrySource).toContain("createElement(SkillNodeView, { controller })");
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("className=");
  });
});
