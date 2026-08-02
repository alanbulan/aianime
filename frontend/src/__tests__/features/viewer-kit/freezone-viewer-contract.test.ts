// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("freezone viewer contracts", () => {
  it("keeps Pano360ViewerNode as a compatible freezone canvas tool", () => {
    const entry = read("src/features/canvas/nodes/Pano360ViewerNode.tsx");
    const model = read(
      "src/features/canvas/application/pano360ViewerNodeModel.ts",
    );
    const controller = read(
      "src/features/canvas/hooks/usePano360ViewerNodeController.ts",
    );
    const view = read(
      "src/features/canvas/nodes/Pano360ViewerNodeView.tsx",
    );
    const canvasNodes = read("src/features/canvas/domain/canvasNodes.ts");
    const registry = read("src/features/canvas/domain/nodeRegistry.ts");
    const nodeSelectionMenuModel = read(
      "src/features/canvas/ui/nodeSelectionMenuModel.ts",
    );
    const spawnOverlay = read("src/features/canvas/ui/NodeSpawnPlusOverlay.tsx");
    const nodesIndex = read("src/features/canvas/nodes/index.ts");

    expect(entry).toContain("usePano360ViewerNodeController(props)");
    expect(controller).toContain("snap2x2");
    expect(controller).toContain("snap4x3");
    expect(model).toContain("sphere_correction_deg");
    expect(view).toContain("selected_background");
    expect(view).toContain("360 自由画布查看器");
    expect(`${entry}${controller}${view}`).not.toContain("PanoCaptureDialog");
    expect(canvasNodes).toContain("pano360Viewer");
    expect(canvasNodes).toContain("Pano360ViewerNodeData");
    expect(registry).toContain("pano360ViewerNodeDefinition");
    expect(registry).toContain("node.menu.pano360Viewer");
    expect(nodeSelectionMenuModel).toContain("CANVAS_NODE_TYPES.pano360Viewer");
    expect(spawnOverlay).toContain("CANVAS_NODE_TYPES.pano360Viewer");
    expect(nodesIndex).toContain("pano360ViewerNode: BoundPano360ViewerNode");
    expect(nodesIndex).toContain(
      "createElement(Pano360ViewerNode, { ...props, projectId })",
    );
    expect(nodesIndex).toContain("Pano360ViewerNode");
  });

  it("keeps the asset pano viewer on the legacy pano capture dialog", () => {
    const controller = read(
      "src/modules/asset_world/application/use-scene-asset-card-controller.ts",
    );
    const view = read(
      "src/modules/asset_world/presentation/SceneAssetCardView.tsx",
    );

    expect(view).toContain("PanoCaptureDialog");
    expect(controller).toContain("useScenePanoManifest");
    expect(controller).toContain("openPanoDialog: () => setPanoDialogOpen(true)");
    expect(controller).toContain("handlePanoCapture");
    expect(view).toContain("onOpenPanoViewer={openPanoDialog}");
    expect(controller).toContain("const handleOpenStageViewer = async () =>");
    expect(controller).toContain("await stageManifest.refetch()");
    expect(controller).toContain("setStageDialogOpen(true)");
    expect(view).toContain("onOpenStageViewer={() => void handleOpenStageViewer()}");
  });

  it("keeps ThreeDWorldNode freezone mode optional and separate from mainline beat overlay requirements", () => {
    const model = read(
      "src/features/canvas/application/threeDWorldNodeModel.ts",
    );
    const controller = read(
      "src/features/canvas/hooks/useThreeDWorldNodeController.ts",
    );
    const view = read("src/features/canvas/nodes/ThreeDWorldNodeView.tsx");
    const implementation = `${model}\n${controller}\n${view}`;

    expect(view).toContain("ThreeDDirectorDialog");
    expect(model).toContain("const SCENE_DIRECTOR_SOURCE_ROLES = new Set");
    expect(model).toContain("'scene_3gs_master_ply'");
    expect(model).toContain("'scene_3gs_custom_scene'");
    expect(model).toContain("function isCandidateDirectorWorldNode");
    expect(model).toContain("!hasMainlineContexts");
    expect(model).toContain("return activeSource ? [activeSource] : [];");
    expect(model).toContain("function isSceneDirectorWorldNode");
    expect(model).toContain("!hasMainlineContexts(");
    expect(model).toContain("if (isSceneDirectorWorldNode(data)) return null;");
    expect(controller).toContain("resolveThreeDWorldBeatContext(data, contexts)");
    expect(view).toContain("viewerPurpose={beatContext ? 'beat' : 'freezone'}");
    expect(model).toContain("canvas_screenshot_node");
    expect(model).toContain("beat_selected_background");
    expect(view).toContain("beatContext ? controller.submitDirectorCombined : undefined");
    expect(view).toContain("onCaptureCanvasNode={controller.captureCanvasNode}");
    expect(model).toContain("isDirectorRenderNode");
    expect(model).toContain("fallbackUrl ?? upstreamUrl");
    expect(controller).toContain("snapshot: meta.snapshot");
    expect(implementation).not.toContain("blockings_dir_fs:");
    expect(implementation).not.toContain("slate_beat:");
  });

  it("keeps scene director world assets scene-scoped when they are added to freezone", () => {
    const panel = read(
      "src/modules/creative_canvas/presentation/AssetLibraryPanel.tsx",
    );
    const assetLibraryModel = read(
      "src/modules/creative_canvas/domain/assetLibraryModel.ts",
    );
    const assetLibraryInsertion = read(
      "src/modules/creative_canvas/application/assetLibraryCanvasInsertion.ts",
    );
    const assetLibraryInsertionComposition = read(
      "src/app/creative-canvas-shell-composition.tsx",
    );
    const mediaTransferController = read(
      "src/features/canvas/hooks/useCanvasMediaSurfaceController.ts",
    );
    const hydrate = read("src/features/canvas/application/assetDragHydration.ts");
    const composition = read("src/features/canvas/composition.ts");

    expect(assetLibraryModel).toContain(
      ["export const", "SCENE_DIRECTOR_WORLD_ROLE"].join(" "),
    );
    expect(assetLibraryModel).toContain('"scene_director_world"');
    expect(assetLibraryModel).toContain("const sceneContext = existing?.find(");
    expect(assetLibraryModel).toContain(
      'context.kind === "scene" && context.sceneId === sceneId',
    );
    expect(assetLibraryModel).toContain("if (sceneContext) return [sceneContext];");
    expect(assetLibraryModel).toContain('kind: "scene"');
    expect(assetLibraryModel).toContain("sceneId,");
    expect(panel).toContain("onAddAsset={onAddAsset}");
    expect(assetLibraryInsertionComposition).toContain(
      "hydratePayload: hydrateAssetDragPayload",
    );
    expect(assetLibraryInsertion).toContain(
      "hydratedPayload = await hydratePayload(payload)",
    );
    expect(mediaTransferController).toContain("hydrateAssetDragPayload(payload)");
    expect(hydrate).toContain("manifestGateway.getSceneDirectorStageManifest");
    expect(hydrate).not.toContain('from "@/api/');
    expect(composition).toContain("hydrateAssetDragPayloadUseCase(");
    expect(hydrate).toContain("directorWorldSourcesFromManifest");
    expect(hydrate).toContain('role !== SCENE_DIRECTOR_WORLD_ROLE');
    expect(assetLibraryModel).not.toContain("if (existing?.length) return existing;");
  });

  it("lets a source-less ThreeDWorldNode enter a blank Director World", () => {
    const model = read(
      "src/features/canvas/application/threeDWorldNodeModel.ts",
    );
    const controller = read(
      "src/features/canvas/hooks/useThreeDWorldNodeController.ts",
    );
    const view = read("src/features/canvas/nodes/ThreeDWorldNodeView.tsx");
    const implementation = `${model}\n${controller}\n${view}`;

    expect(model).toContain("source_type: 'sog' as const");
    expect(model).toContain("source_kind: 'custom' as const");
    expect(model).toContain("pano_url: undefined");
    expect(view).toContain("{selected ? (");
    expect(implementation).not.toContain("if (!data.plyUrl && !data.panoUrl && !data.sources?.length && upstreamPanoSources.length === 0) return;");
    expect(view).not.toContain("{selected && preview.hasWorldSource ? (");
    expect(view).toContain("t('viewer.threeD.enterDirectorWorld')");
  });

  it("exposes a director world camera reset without clearing saved scene data", () => {
    const dialog = read("src/features/viewer-kit/three-d/ThreeDDirectorDialog.tsx");
    const viewerApp = read("src/features/viewer-kit/three-d/engine/viewerApp.ts");
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");
    const outputSectionIndex = dialog.indexOf('t("viewer.threeD.sections.output")');
    const sourceCalibrationResetIndex = dialog.indexOf('t("viewer.threeD.sourceCalibration.reset")');
    const resetCameraIndex = dialog.indexOf(
      't("viewer.threeD.resetCamera")',
      sourceCalibrationResetIndex,
    );
    const beatOverlaySectionIndex = dialog.indexOf('t("viewer.threeD.beatOverlay.title")');
    const beatOverlaySection = dialog.slice(beatOverlaySectionIndex, outputSectionIndex);
    const outputSection = dialog.slice(outputSectionIndex);

    expect(viewerApp).toContain("resetCamera: () =>");
    expect(dialog).toContain("viewerApp.resetCamera()");
    expect(dialog).toContain('t("viewer.threeD.resetCamera")');
    expect(sourceCalibrationResetIndex).toBeGreaterThan(-1);
    expect(resetCameraIndex).toBeGreaterThan(sourceCalibrationResetIndex);
    expect(resetCameraIndex).toBeLessThan(beatOverlaySectionIndex);
    expect(beatOverlaySection).not.toContain('t("viewer.threeD.resetCamera")');
    expect(outputSection).not.toContain('t("viewer.threeD.resetCamera")');
    expect(dialog).not.toContain("onClearScene?.() && viewer.resetCamera()");
    expect(zh).toContain('"resetCamera": "重置镜头"');
    expect(en).toContain('"resetCamera": "Reset camera"');
  });

  it("copies a selected beat overlay into the current beat explicitly", () => {
    const dialog = read("src/features/viewer-kit/three-d/ThreeDDirectorDialog.tsx");
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(dialog).toContain("const sourceBeatNumber = Number(selectedOverlayBeat);");
    expect(dialog).toContain("const targetBeatNumber = manifest.beat_context.beat;");
    expect(dialog).toContain("target_beat: targetBeatNumber");
    expect(dialog).toContain("beat: targetBeatNumber");
    expect(dialog).toContain("applyOverlayStatus(next, targetBeatNumber)");
    expect(dialog).toContain('t("viewer.threeD.beatOverlay.copyFlow"');
    expect(zh).toContain('"inheritedFromBeat": "当前未保存，临时沿用镜头 {{beat}}"');
    expect(en).toContain('"inheritedFromBeat": "Not saved yet; temporarily using shot {{beat}}"');
    expect(dialog).not.toContain("const loaded = await loadOverlay(beatNumber);");
    expect(zh).toContain('"copyFlow": "复制来源：镜头 {{sourceBeat}} → 当前镜头 {{targetBeat}}"');
    expect(zh).toContain('"copySelected": "复制来源到当前镜头"');
    expect(en).toContain('"copyFlow": "Copy source: shot {{sourceBeat}} -> current shot {{targetBeat}}"');
    expect(en).toContain('"copySelected": "Copy source into current shot"');
  });

  it("lets scene director worlds create unbounded anonymous actors and props with neutral fallback color", () => {
    const dialog = read("src/features/viewer-kit/three-d/ThreeDDirectorDialog.tsx");
    const manifest = read("src/features/viewer-kit/three-d/directorManifest.ts");
    const worldController = read(
      "src/features/canvas/hooks/useThreeDWorldNodeController.ts",
    );
    const canvasComposition = read("src/features/canvas/composition.ts");
    const skillNode = [
      read("src/features/canvas/application/skillNodeModel.ts"),
      read("src/features/canvas/hooks/useSkillNodeController.ts"),
      read("src/features/canvas/nodes/SkillNodeView.tsx"),
    ].join("\n");
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(manifest).toContain("anonymous_prop_colors: string[];");
    expect(canvasComposition).toContain("getCanvasDirectorStagePalette");
    expect(worldController).toContain("getCanvasDirectorStagePalette({ projectId })");
    expect(worldController).toContain("defaultPalette");
    expect(worldController).not.toContain("ANONYMOUS_DIRECTOR_COLORS");
    expect(worldController).not.toContain("ANONYMOUS_DIRECTOR_PROP_COLORS");
    expect(dialog).not.toContain("ANONYMOUS_ACTOR_COLORS");
    expect(dialog).not.toContain("ANONYMOUS_PROP_COLORS");
    expect(skillNode).not.toContain("BEAT_ACTOR_COLORS");
    expect(skillNode).not.toContain("BEAT_PROP_COLORS");
    expect(dialog).toContain('const ANONYMOUS_FALLBACK_COLOR = "#9ca3af"');
    expect(dialog).toContain("anonymousSequence.actor + 1");
    expect(dialog).toContain("anonymousSequence.prop + 1");
    expect(dialog).toContain("const anonymousPropColors = manifest.palette.anonymous_prop_colors ?? []");
    expect(dialog).toContain("colorFromCreationPalette(anonymousActorPalette, anonymousSequence.actor)");
    expect(dialog).toContain("colorFromCreationPalette(anonymousPropPalette, anonymousSequence.prop)");
    expect(dialog).toContain("const nextPropLikeColor = colorFromCreationPalette(anonymousPropPalette, anonymousSequence.prop)");
    expect(dialog).toContain("const [propLikeColor, setPropLikeColor] = useState<string>(ANONYMOUS_FALLBACK_COLOR)");
    expect(dialog).toContain("if (activeProp) setPropLikeColor(activeProp.color)");
    expect(dialog).toContain("function ColorPaletteField");
    expect(dialog).toContain('className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(24px,24px))] gap-2"');
    expect(dialog).toContain("border-primary ring-2 ring-primary/45 ring-offset-1 ring-offset-muted");
    expect(dialog).toContain("ColorPaletteField");
    expect(dialog).toContain("anonymousPropColors.length > 0");
    expect(dialog).toContain("? anonymousPropColors");
    expect(dialog).toContain("setAnonymousSequence((prev) => ({ ...prev, actor: prev.actor + 1 }))");
    expect(dialog).toContain("setAnonymousSequence((prev) => ({ ...prev, prop: prev.prop + 1 }))");
    expect(dialog.match(/setAnonymousSequence\(\(prev\) => \(\{ \.\.\.prev, prop: prev\.prop \+ 1 \}\)\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(dialog).toContain('manifest.mode === "beat" ? activeActor.color : actorColor');
    expect(dialog).toContain("const color = manifest.mode === \"beat\" ? activeProp.color : propLikeColor");
    expect(dialog).toContain("color: propLikeColor");
    expect(dialog).toContain("onChange={setPropLikeColor}");
    expect(dialog).toContain("palette={anonymousActorPalette}");
    expect(dialog).toContain("palette={anonymousPropPalette}");
    expect(dialog).toContain('label={t("viewer.threeD.propColor")}');
    expect(dialog).toContain('label={t("viewer.threeD.stagingColor")}');
    expect(dialog).toContain('selection?.kind === "staging"');
    expect(dialog).toContain('label={t("viewer.threeD.stagingShapeHint")}');
    expect(dialog).not.toContain('color: "#4587ff"');
    expect(dialog).not.toContain('payload?.marker_color ?? payload?.color ?? "#4587ff"');
    expect(dialog).not.toContain("const [propColor");
    expect(dialog).toContain('t("viewer.threeD.propColor")');
    expect(dialog).toContain('t("viewer.threeD.stagingColor")');
    expect(dialog).not.toContain('t("viewer.threeD.propShapeHint")');
    expect(dialog).toContain('t("viewer.threeD.stagingShapeHint")');
    expect(dialog).toContain('t("viewer.threeD.nextAnonymousActor"');
    expect(dialog).toContain('t("viewer.threeD.nextAnonymousProp"');
    expect(zh).toContain('"nextAnonymousActor": "下一个人物：{{label}} · {{color}}"');
    expect(zh).toContain('"nextAnonymousProp": "下一个道具：{{label}} · {{color}}"');
    expect(zh).toContain('"propColor": "道具颜色"');
    expect(zh).toContain('"stagingColor": "占位颜色"');
    expect(zh).toContain('"stagingShapeHint": "占位形状"');
    expect(en).toContain('"nextAnonymousActor": "Next actor: {{label}} · {{color}}"');
    expect(en).toContain('"nextAnonymousProp": "Next prop: {{label}} · {{color}}"');
    expect(en).toContain('"propColor": "Prop color"');
    expect(en).toContain('"stagingColor": "Staging color"');
    expect(en).toContain('"stagingShapeHint": "Staging shape"');
  });

  it("uses shape hints to build visible prop and staging proxy silhouettes", () => {
    const viewerApp = read("src/features/viewer-kit/three-d/engine/viewerApp.ts");
    const shapeHints = read("src/features/viewer-kit/three-d/engine/shapeHints.ts");
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(shapeHints).toContain("sports_car");
    expect(shapeHints).toContain("export function proxyPartsForHint");
    expect(viewerApp).toContain("proxyPartsForHint");
    expect(viewerApp).toContain("function rebuildShapeHintProxy");
    expect(viewerApp).toContain("rebuildShapeHintProxy(entity, hint, colorHex)");
    expect(viewerApp).toContain("markerShapeHints.set(selection.entity, hint)");
    expect(viewerApp).toContain("getMarkerShapeHint");
    expect(viewerApp).toContain("selection.kind !== 'staging'");
    expect(viewerApp).toContain("rebuildShapeHintProxy(selection.entity, hint, markerColors.get(selection.entity)");
    expect(viewerApp).toContain("const ground = pos.y + s.y * proxyLocalBottomForHint(hint)");
    expect(viewerApp).toContain("pos.x, ground - next.y * proxyLocalBottomForHint(hint), pos.z");
    expect(viewerApp).not.toContain("entity.addComponent('render', { type: 'box' });\n      const mat = makeMaterial(color);");
    expect(zh).toContain('"sports_car": "跑车"');
    expect(en).toContain('"sports_car": "Sports car"');
  });

  it("keeps director marker pixels at their assigned palette colors in combined captures", () => {
    const viewerApp = read("src/features/viewer-kit/three-d/engine/viewerApp.ts");

    expect(viewerApp).toContain("m.useTonemap = false;");
    expect(viewerApp).toContain("m.opacity = 1;");
    expect(viewerApp).toContain("m.blendType = pc.BLEND_NONE;");
    expect(viewerApp).toContain("context.imageSmoothingEnabled = renderMode === 'env_only';");
    expect(viewerApp).not.toContain("m.opacity = 0.92;");
    expect(viewerApp).not.toContain("m.blendType = pc.BLEND_NORMAL;");
  });

  it("documents that F only moves the selection to the crosshair", () => {
    const dialog = read("src/features/viewer-kit/three-d/ThreeDDirectorDialog.tsx");
    const viewerApp = read("src/features/viewer-kit/three-d/engine/viewerApp.ts");
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(dialog).toContain('case "KeyF":');
    expect(dialog).toContain("viewerApp.moveSelectedToCrosshair()");
    expect(dialog).toContain('case "KeyM":');
    expect(dialog).toContain("viewerApp.mountSelectedAtCrosshair()");
    expect(viewerApp).not.toContain("if (mountSelectedAtCrosshair()) return true;");
    expect(zh).toContain("F 移到准星");
    expect(zh).toContain("M 挂到准星");
    expect(en).toContain("F move to crosshair");
    expect(en).toContain("M mount to crosshair");
  });

  it("restores explicit actor mount relationships without making F auto-mount", () => {
    const viewerApp = read("src/features/viewer-kit/three-d/engine/viewerApp.ts");
    const dialog = read("src/features/viewer-kit/three-d/ThreeDDirectorDialog.tsx");
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(viewerApp).toContain("mount?: { kind: 'prop' | 'staging'; index: number; attachPointId: string };");
    expect(viewerApp).toContain("const mountLinks = new WeakMap<pc.Entity, MountTarget>();");
    expect(viewerApp).toContain("function mountSelectedAtCrosshair(): boolean");
    expect(viewerApp).toContain("function unmountSelected(): boolean");
    expect(viewerApp).toContain("function syncMountedActorsOf(prop: pc.Entity): void");
    expect(viewerApp).toContain("snap.mount = { kind: link.kind, index: idx, attachPointId: link.attachPointId };");
    expect(viewerApp).toContain("mountActorOn(actor, { kind: s.mount.kind, entity: target, attachPointId: s.mount.attachPointId || '' });");
    expect(viewerApp).toContain("if (selection.kind !== 'actor') syncMountedActorsOf(selection.entity);");
    expect(viewerApp).toContain("syncMountedActorsForSelection();");
    expect(viewerApp).toContain("function syncMountedActorsForSelection(): void");
    expect(viewerApp).not.toContain("if (mountSelectedAtCrosshair()) return true;");
    expect(dialog).toContain("viewer.mountSelectedAtCrosshair()");
    expect(dialog).toContain("viewer.unmountSelected()");
    expect(dialog).toContain("selection.mounted");
    expect(zh).toContain('"mountSelected": "挂到准星目标"');
    expect(zh).toContain('"unmountSelected": "解除挂载"');
    expect(en).toContain('"mountSelected": "Mount to crosshair target"');
    expect(en).toContain('"unmountSelected": "Unmount"');
  });

  it("moves selected markers to the actual center-screen crosshair ray", () => {
    const viewerApp = read("src/features/viewer-kit/three-d/engine/viewerApp.ts");

    expect(viewerApp).toContain("function crosshairRay(): pc.Ray | null");
    expect(viewerApp).toContain("return screenToRay(rect.left + rect.width / 2, rect.top + rect.height / 2);");
    expect(viewerApp).toContain("app.graphicsDevice.maxPixelRatio = dpr;");
    expect(viewerApp).toContain("app.resizeCanvas(rect.width, rect.height);");
    expect(viewerApp).toContain("const x = clientX - rect.left;");
    expect(viewerApp).toContain("const y = clientY - rect.top;");
    expect(viewerApp).not.toContain("canvas.width = Math.max(1, Math.round(rect.width * dpr));");
    expect(viewerApp).not.toContain("const x = (clientX - rect.left) * scaleX;");
    expect(viewerApp).toContain("function raycastRayToHorizontalPlane(ray: pc.Ray, planeY: number): pc.Vec3 | null");
    expect(viewerApp).toContain("const current = selection.entity.getPosition();");
    expect(viewerApp).toContain("const hit = raycastRayToHorizontalPlane(ray, current.y);");
    expect(viewerApp).toContain("selection.entity.setPosition(hit.x, current.y, hit.z);");
    expect(viewerApp).not.toContain("raycastRayToCollision");
    expect(viewerApp).not.toContain("source: 'collision'");
    expect(viewerApp).not.toContain("const ray = new pc.Ray(camera.getPosition().clone(), camera.forward.clone().normalize());");
  });

  it("hides the system cursor while left-dragging the 3D camera", () => {
    const flyCamera = read("src/features/viewer-kit/three-d/engine/flyCamera.ts");

    expect(flyCamera).toContain("let cursorBeforeLeftDrag: string | null = null;");
    expect(flyCamera).toContain("if (event.button === 0) {");
    expect(flyCamera).toContain("cursorBeforeLeftDrag = canvas.style.cursor;");
    expect(flyCamera).toContain("canvas.style.cursor = 'none';");
    expect(flyCamera).toContain("canvas.style.cursor = cursorBeforeLeftDrag;");
    expect(flyCamera).toContain("cursorBeforeLeftDrag = null;");
    expect(flyCamera).toContain("const restoreLeftDragCursor = () => {");
    expect(flyCamera).toContain("document.addEventListener('pointercancel', onPointerCancel);");
    expect(flyCamera).toContain("canvas.addEventListener('lostpointercapture', onLostPointerCapture);");
    expect(flyCamera).toContain("restoreLeftDragCursor();");
  });

  it("tears down PlayCanvas update and ignores async source loads after destroy", () => {
    const viewerApp = read("src/features/viewer-kit/three-d/engine/viewerApp.ts");

    expect(viewerApp).toContain("let destroyed = false;");
    expect(viewerApp).toContain("const updateHandler = () => {");
    expect(viewerApp).toContain("app.on('update', updateHandler);");
    expect(viewerApp).toContain("if (destroyed) return;");
    expect(viewerApp).toContain("destroyed = true;");
    expect(viewerApp).toContain("app.off('update', updateHandler);");
    expect(viewerApp).toContain("if (destroyed) {");
    expect(viewerApp).toContain("app.assets.remove(asset);");
  });

  it("keeps generated scene 360 panoramas on the legacy pano viewer path", () => {
    const overlay = read("src/features/canvas/ui/Scene360Overlay.tsx");

    expect(overlay).toContain("CANVAS_NODE_TYPES.pano360Viewer");
    expect(overlay).not.toContain("CANVAS_NODE_TYPES.threeDWorld");
    expect(overlay).not.toContain("source_type: 'pano360'");
    expect(overlay).not.toContain("activeSourceId");
    expect(overlay).toContain("output_role: 'scene_360_candidate'");
    expect(overlay).toContain("media_kind: 'pano360'");
    expect(overlay).toContain("aspectRatio,");
  });

  it("lets canvas ThreeDWorldNode open pano360 image sources when explicitly connected", () => {
    const canvasNodes = read("src/features/canvas/domain/canvasNodes.ts");
    const model = read(
      "src/features/canvas/application/threeDWorldNodeModel.ts",
    );
    const controller = read(
      "src/features/canvas/hooks/useThreeDWorldNodeController.ts",
    );
    const view = read("src/features/canvas/nodes/ThreeDWorldNodeView.tsx");
    const implementation = `${model}\n${controller}\n${view}`;

    expect(canvasNodes).toContain("panoUrl?: string | null");
    expect(canvasNodes).toContain("sources?: DirectorWorldSource[]");
    expect(model).toContain("source_type: sourceType");
    expect(model).toContain("sourceType = data.plyUrl ? 'sog' : 'pano360'");
    expect(model).toContain("directorPanoSourceFromCanvasNode");
    expect(controller).toContain("const upstreamPanoSources");
    expect(model).toContain("for (const source of upstreamPanoSources)");
    expect(implementation).not.toContain("getSceneDirectorStageManifest");
    expect(implementation).not.toContain("canHydrateSceneDirectorWorld");
    expect(implementation).not.toContain("saveSceneDirectorWorld");
    expect(implementation).not.toContain("clearSceneDirectorWorld");
    expect(implementation).not.toContain("localScenePatchFromManifest");
    expect(implementation).not.toContain("sceneIdFromThreeDWorldNode");
    expect(controller).toContain("directorManifest?.scene");
    expect(controller).toContain("directorManifest?.scenes_by_source_id");
    expect(implementation).not.toContain("function isPanoImageNode");
    expect(implementation).not.toContain("function directorPanoSourceFromUpstream");
    expect(implementation).not.toContain("if (!data.plyUrl && !data.panoUrl && !data.sources?.length && upstreamPanoSources.length === 0) return");
    expect(view).toContain("{selected ? (");
    expect(model).toContain("sources: directorSources.length > 0 ? directorSources : undefined");
    expect(controller).toContain("activeSourceId");
    expect(model).toContain("snapshot.world?.activeSourceId");
    expect(model).toContain("activeSourceId: nextActiveSourceId");
    expect(model).toContain("scenesBySourceId");
    expect(view).toContain("initialScenesBySourceId");
  });

  it("commits scene director worlds only through the explicit structured commit path", () => {
    const push = read("src/modules/creative_canvas/domain/assetCommit.ts");
    const target = read("src/modules/creative_canvas/domain/pushTarget.ts");
    const submitController = read(
      "src/modules/creative_canvas/presentation/useCommitDialogSubmitController.ts",
    );
    const shell = read(
      "src/modules/creative_canvas/presentation/useFreezoneShellController.ts",
    );
    const commitController = read(
      "src/modules/creative_canvas/presentation/useCanvasCommitController.ts",
    );
    const commitComposition = read(
      "src/modules/creative_canvas/canvasCommitControllerComposition.ts",
    );

    expect(push).toContain('"scene_director_world"');
    expect(target).toContain('role === "scene_director_world"');
    expect(submitController).toContain(
      "commitSceneDirectorWorldFromCanvasNode",
    );
    expect(shell).toContain("useCanvasCommitController");
    expect(commitController).toContain("saveOpenDirectorWorldScene(nodeId)");
    expect(commitController).toContain("nodeData: latestData");
    expect(commitController).toContain("nodeDataPatchAfterCommittedTarget");
    expect(commitController).toContain("sceneDirectorWorldDataForManifest");
    expect(commitController).toContain("invalidateCommittedTarget(target)");
    expect(commitComposition).toContain(
      "queryKeys.sceneDirectorStageManifest(",
    );
    expect(commitController).not.toContain("updateNodeData(nodeId, manifestNodeData)");
    expect(shell).not.toContain("saveOpenDirectorWorldScene");
  });

  it("keeps Director World generation behind the connected ThreeDWorldNode", () => {
    const toolbar = read("src/features/canvas/ui/NodeActionToolbarView.tsx");
    const overlay = read("src/features/canvas/ui/SelectedNodeOverlay.tsx");
    const worldModel = read(
      "src/features/canvas/application/threeDWorldNodeModel.ts",
    );
    const worldController = read(
      "src/features/canvas/hooks/useThreeDWorldNodeController.ts",
    );
    const worldView = read(
      "src/features/canvas/nodes/ThreeDWorldNodeView.tsx",
    );
    const worldImplementation = `${worldModel}\n${worldController}\n${worldView}`;
    const sourceKindDomain = read(
      "src/modules/creative_canvas/domain/imageTo3d.ts",
    );
    const generationUseCase = read(
      "src/modules/creative_canvas/application/generateCanvasImageTo3d.ts",
    );
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(toolbar).not.toContain("nodeToolbar.generateDirectorWorld");
    expect(toolbar).not.toContain("nodeToolbar.addPanoToDirectorWorld");
    expect(overlay).not.toContain("handleGenerateDirectorWorldFromImage");
    expect(overlay).not.toContain("handleAddPanoToDirectorWorld");
    expect(worldImplementation).not.toContain("PLY_KIND_OPTIONS");
    expect(worldView).toContain("DIRECTOR_IMAGE_SOURCE_OPTIONS");
    expect(worldView).toContain("nodeToolbar.normalImage");
    expect(worldView).toContain("nodeToolbar.image360");
    expect(worldView).toContain("referenceImages");
    expect(worldView).toContain("onReferenceImageChange");
    expect(worldModel).toContain("resolveThreeDWorldImageSourceKind");
    expect(worldModel).toContain("isPanoImageCanvasNode(sourceNode)");
    expect(worldController).toContain("resolveCanvasImageTo3dSourceKind(");
    expect(worldController).toContain("await generateCanvasImageTo3d(");
    expect(worldImplementation).not.toContain("submitFreezoneImageTo3GS");
    expect(worldImplementation).not.toContain("awaitTaskCompletion");
    expect(sourceKindDomain).toContain('sourceRole === "scene_reverse_master"');
    expect(generationUseCase).toContain("sourceFromImageTo3gsResult(");
    expect(zh).toContain('"generateDirectorWorld": "生成3DGS世界"');
    expect(en).toContain('"generateDirectorWorld": "Generate 3DGS World"');
  });

  it("keeps freezone 3GS commit roles for generated PLY source kinds", () => {
    const commit = read("src/modules/creative_canvas/application/assetCommit.ts");

    expect(commit).toContain("scene_3gs_master_ply");
    expect(commit).toContain("scene_3gs_reverse_ply");
    expect(commit).toContain("scene_3gs_pano_ply");
    expect(commit).not.toContain("scene_3gs_collision_glb");
  });

  it("auto-commits present image generation nodes when requested by the preset", () => {
    const imageGenController = read(
      "src/features/canvas/hooks/useImageGenNodeController.ts",
    );

    expect(imageGenController).toContain("autoCommitOnGenerate");
    expect(imageGenController).toContain("publishCanvasCommitRequested({");
    expect(imageGenController).toContain("auto: true");
  });

  it("routes projection group toolbar actions through projection sync and remove events", () => {
    const toolbar = read("src/features/canvas/ui/NodeActionToolbarView.tsx");
    const managementModel = read(
      "src/features/canvas/application/nodeManagementToolbarModel.ts",
    );
    const managementController = read(
      "src/features/canvas/hooks/useNodeManagementToolbarController.ts",
    );
    const shell = read(
      "src/modules/creative_canvas/presentation/useFreezoneShellController.ts",
    );
    const commandController = read(
      "src/modules/creative_canvas/presentation/useCanvasProjectionCommandController.ts",
    );
    const commandApplication = read(
      "src/modules/creative_canvas/application/canvasProjection.ts",
    );
    const commandComposition = read(
      "src/modules/creative_canvas/canvasProjectionCommandComposition.ts",
    );
    const statusLifecycle = read(
      "src/modules/creative_canvas/canvasProjectionStatusLifecycleComposition.ts",
    );
    const ports = read("src/features/canvas/application/ports.ts");
    const groupNodeController = read(
      "src/features/canvas/hooks/useGroupNodeController.ts",
    );
    const groupNodeView = read(
      "src/features/canvas/nodes/GroupNodeView.tsx",
    );

    expect(toolbar).toContain("<NodeManagementToolbarActions node={node} />");
    expect(managementModel).toContain("isProtectedProjectionGroupNode(node)");
    expect(managementController).toContain(
      "publishCanvasProjectionSyncRequested(projection.projectionKey)",
    );
    expect(managementController).toContain(
      "publishCanvasProjectionRemovalRequested(projection.projectionKey)",
    );
    expect(managementController).toContain("useCanvasProjectionStatus(");
    expect(commandController).toContain('"freezone/projection-sync"');
    expect(commandController).toContain("handleSyncProjection(projectionKey)");
    expect(commandController).toContain('"freezone/projection-remove"');
    expect(commandController).toContain("handleRemoveProjection(projectionKey)");
    expect(commandApplication).toContain("requestFromProjectionMetadata(");
    expect(commandApplication).toContain("dependencies.queueProjection(");
    expect(commandComposition).toContain("removeLocalFreezoneProjection");
    expect(shell).not.toContain("<ProjectionPanel");
    expect(shell).toContain("useCanvasProjectionCommandController({");
    expect(shell).toContain("useCanvasProjectionStatusLifecycle({");
    expect(statusLifecycle).toContain("setCanvasProjectionStatuses(result.projections)");
    expect(statusLifecycle).toContain("clearCanvasProjectionStatuses()");
    expect(groupNodeController).toContain(
      "useCanvasProjectionStatus(projectionKey)",
    );
    expect(groupNodeView).toContain("projection-stale-frame");
    expect(groupNodeView).toContain("projection-stale-banner");
    expect(groupNodeView).toContain("freezone.projections.staleBadge");
    expect(ports).not.toContain("'freezone/projection-sync'");
    expect(ports).not.toContain("'freezone/projection-remove'");
  });

  it("uses the backend scene Director World manifest as the single source of truth", () => {
    const scenesPanel = read(
      "src/modules/asset_world/application/use-scene-asset-card-controller.ts",
    );

    expect(scenesPanel).toContain("useSceneDirectorStageManifest");
    expect(scenesPanel).toContain("const sceneDirectorManifest = stageManifest.data?.ok");
    expect(scenesPanel).toContain("? stageManifest.data.data");
    expect(scenesPanel).toContain(": null");
    expect(scenesPanel).not.toContain("scenePanoDirectorManifest");
    expect(scenesPanel).not.toContain("directorManifestWithScenePanoSource");
  });

  it("keeps viewer purpose and capture metadata as explicit shared contracts", () => {
    const purpose = read("src/features/viewer-kit/viewerPurpose.ts");
    const capturePartners = read(
      "src/features/canvas/domain/canvasCapturePartners.ts",
    );
    const captureCreation = read(
      "src/features/canvas/application/panoCaptureNodes.ts",
    );

    expect(purpose).toContain('ViewerPurpose = "mainline" | "freezone" | "asset" | "beat"');
    expect(capturePartners).toContain("captureMetadata");
    expect(captureCreation).toContain(
      "captureMetadata: capture.metadata ?? null",
    );
  });
});
