// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("beats sketch/render v2 contract", () => {
  it("does not expose the legacy /sketches/batch auto-select action", () => {
    const batchBar = read("src/components/episode/beat-workbench/batch-bar.tsx");
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchBarSources = `${batchBar}\n${batchBarController}\n${batchBarView}`;
    const sketches = read("src/lib/queries/sketches.ts");

    expect(batchBarSources).not.toContain("useBatchSketches");
    expect(batchBarSources).not.toContain("batchSketchTask");
    expect(batchBarSources).not.toContain("handleBatchSketches");
    expect(batchBarSources).not.toContain("episode.workbench.batch.autoSelect");
    expect(sketches).not.toContain("sketches/batch");
    expect(sketches).not.toContain("useBatchRender");
    expect(sketches).not.toContain("grids/batch-render");
  });

  it("keeps global render generation out of the top toolbar", () => {
    const taskTypes = read("src/lib/task-types.ts");
    const stageRegistry = read("src/lib/episode-stage-registry.ts");
    const batchBar = read("src/components/episode/beat-workbench/batch-bar.tsx");
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchBarSources = `${batchBar}\n${batchBarController}\n${batchBarView}`;
    const batchPanel = read("src/components/episode/beat-workbench/batch-panel.tsx");
    const batchPanelController = read(
      "src/modules/production/application/use-batch-panel-controller.ts",
    );
    const actionPanel = read("src/components/episode/beat-workbench/action-panel.tsx");
    const productionGateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );

    expect(taskTypes).not.toContain('BATCH_RENDER: "batch_render"');
    expect(stageRegistry).not.toContain("TASK_TYPES.BATCH_RENDER");
    expect(taskTypes).not.toContain('RENDER_PLAN: "render_plan"');
    expect(stageRegistry).not.toContain("TASK_TYPES.RENDER_PLAN");
    expect(taskTypes).not.toContain('VIDEO_GENERATION: "video_generation"');
    expect(stageRegistry).not.toContain("TASK_TYPES.VIDEO_GENERATION");

    expect(batchBarSources).not.toContain("useBatchRender");
    expect(batchBarSources).not.toContain("batchRenderTask = useTaskController");
    expect(batchBarSources).not.toContain("TASK_TYPES.BATCH_RENDER");
    expect(batchBarSources).not.toContain("batchRenderTask.start()");
    expect(batchBarSources).not.toContain("renderPlanTask = useTaskController");
    expect(batchBarSources).not.toContain("setRenderPlanOpen(true)");
    expect(batchBarSources).not.toContain("<RenderPlanDialog");
    expect(batchBarSources).not.toContain("episode.workbench.batch.genRender");
    expect(actionPanel).not.toContain("<BatchPanel");
    expect(batchBarSources).not.toContain("useGenerateVideos");
    expect(batchBarSources).not.toContain("handleGenAllVideos");
    expect(batchBarSources).not.toContain("episode.workbench.batch.genVideoTitle");

    // Render regen fans out into N selected_regen grid tasks; track them by id
    // via the batch-invalidation hook rather than a single-scope controller.
    expect(batchPanelController).toContain("useScopedTaskBatchInvalidation");
    expect(batchPanelController).toContain("TASK_TYPES.SELECTED_REGEN");
    expect(batchPanelController).toContain('matchBy: "task_id"');
    expect(batchPanel).toContain("<RenderPlanDialog");
    expect(batchPanel).not.toContain("handleBatchVideo");
    expect(productionGateway).toContain("render/plan");
    expect(productionGateway).toContain("render/execute");
  });

  it("does not expose whole-episode sketch generation from the batch toolbar", () => {
    const batchBar = read("src/components/episode/beat-workbench/batch-bar.tsx");
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchBarSources = `${batchBar}\n${batchBarController}\n${batchBarView}`;

    expect(batchBarSources).not.toContain("useGenerateSketches");
    expect(batchBarSources).not.toContain("handleGenAllSketches");
    expect(batchBarSources).not.toContain("episode.workbench.batch.genSketchTitle");
    expect(batchBarSources).not.toContain("episode.workbench.batch.genSketch");
  });

  it("keeps AI prompt optimization in the sketch SuperPower workflow", () => {
    const batchBar = read("src/components/episode/beat-workbench/batch-bar.tsx");
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const productionVideoGateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );
    const renderedActions = batchBarView.slice(batchBarView.indexOf("return ("));

    const superpowerAction = renderedActions.indexOf("episode.workbench.batch.aiOptimizeTitle");

    expect(batchBar).toContain("useBatchBarController");
    expect(batchBarController).toContain("queries.useGlobalOptimize");
    expect(productionVideoGateway).toContain("optimize/video-global");
    expect(superpowerAction).toBeGreaterThan(-1);
    expect(renderedActions).not.toContain("openRenderPlan(false)");
    expect(renderedActions).not.toContain("episode.workbench.batch.genVideoTitle");
  });

  it("keeps grid sketch generation available outside BatchBar", () => {
    const batchBar = read("src/components/episode/beat-workbench/batch-bar.tsx");
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchBarSources = `${batchBar}\n${batchBarController}\n${batchBarView}`;
    const sketchGridGallery = read(
      "src/components/episode/beat-workbench/sketch-grid-gallery.tsx",
    );
    const sketchGridController = read(
      "src/modules/production/application/use-sketch-grid-gallery-controller.ts",
    );
    const productionPublic = read("src/modules/production/public.ts");
    const productionGateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );

    expect(batchBarSources).not.toContain("gridIndex: -1");
    expect(sketchGridGallery).toContain("useSketchGridCardController");
    expect(sketchGridGallery).not.toContain("useGenerateSketches");
    expect(sketchGridController).toContain("queries.useGenerateSketches");
    expect(productionPublic).toContain("useGenerateSketches");
    expect(productionGateway).toContain("sketches/generate");
  });

  it("keeps selected-beat render regeneration backed by render_plan", () => {
    const taskTypes = read("src/lib/task-types.ts");
    const stageRegistry = read("src/lib/episode-stage-registry.ts");
    const batchPanelController = read(
      "src/modules/production/application/use-batch-panel-controller.ts",
    );
    const renderSection = read("src/components/episode/beat-workbench/render-section.tsx");
    const renderSectionController = read(
      "src/modules/production/application/use-render-section-controller.ts",
    );

    expect(taskTypes).not.toContain('RENDER_PLAN: "render_plan"');
    expect(stageRegistry).not.toContain("TASK_TYPES.RENDER_PLAN");

    expect(batchPanelController).toContain("useScopedTaskBatchInvalidation");
    expect(batchPanelController).toContain("TASK_TYPES.SELECTED_REGEN");
    expect(batchPanelController).toContain('matchBy: "task_id"');
    expect(renderSection).not.toContain("useRegenerateRenderBeats");
    expect(renderSectionController).toContain("useRegenerateRenderBeats");
    expect(renderSectionController).toContain('taskType: "selected_regen"');
  });

  it("moves selected redraw actions to the ViewToggles row instead of the top toolbar or right panel", () => {
    const batchBar = read("src/components/episode/beat-workbench/batch-bar.tsx");
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchBarSources = `${batchBar}\n${batchBarController}\n${batchBarView}`;
    const actionPanel = read("src/components/episode/beat-workbench/action-panel.tsx");
    const viewToggles = read(
      "src/modules/narrative_planning/presentation/ViewToggles.tsx",
    );
    const view = read(
      "src/modules/narrative_planning/presentation/BeatsPageView.tsx",
    );
    const sketchPlanController = read(
      "src/modules/narrative_planning/application/use-beats-sketch-plan-controller.ts",
    );

    expect(viewToggles).toContain("onBatchRegenSketch");
    expect(viewToggles).toContain("onBatchRegenRender");
    expect(viewToggles).toContain("episode.workbench.view.batchRegenSketch");
    expect(viewToggles).toContain("episode.workbench.view.batchRegenRender");
    expect(view).toContain("onBatchRegenSketch={openSketchPlan}");
    expect(view).toContain("onBatchRegenRender={openRenderPlan}");
    expect(view).toContain("<RenderPlanDialog");
    expect(view).toContain("aspectMode={renderAspectMode}");
    expect(sketchPlanController).toContain(
      "dependencies.createSketchPlanItems",
    );
    expect(sketchPlanController).not.toContain("useRegenerateRenderBeats");
    expect(sketchPlanController).not.toContain(
      "bestFitMode(SKETCH_REGEN_MODES",
    );

    expect(batchBarSources).not.toContain("checkedBeats");
    expect(batchBarSources).not.toContain("dispatchSelectedSketchItems");
    expect(actionPanel).not.toContain("<BatchPanel");
  });

  it("dispatches selected-beat sketch plans directly without persistent queue cards", () => {
    const batchPanelController = read(
      "src/modules/production/application/use-batch-panel-controller.ts",
    );

    expect(batchPanelController).toContain("dispatchSketchPlanItems");
    expect(batchPanelController).not.toContain("sketchDispatchQueue");
    expect(batchPanelController).not.toContain("sketchDispatchRun");
    expect(batchPanelController).not.toContain("handleDispatchSketchItem");
    expect(batchPanelController).toContain("onClearSelection()");
  });

  it("labels the selected sketch grid action as batch redraw instead of auto combine", () => {
    const batchPanelView = read(
      "src/modules/production/presentation/BatchPanelView.tsx",
    );
    const sketchSection = batchPanelView.slice(
      batchPanelView.indexOf("{/* Sketch modes */}"),
      batchPanelView.indexOf("{/* Render modes */}"),
    );

    expect(sketchSection).toContain("episode.workbench.batch.autoCombine");
    expect(sketchSection).toContain('defaultValue: "批量重抽"');
    expect(sketchSection).not.toContain('defaultValue: "自动组合"');
  });

  it("wires NiceGUI Render model/settings into React controls and task payloads", () => {
    const batchBar = read("src/components/episode/beat-workbench/batch-bar.tsx");
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const productionGateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );
    const queryKeys = read("src/lib/query-keys.ts");
    const projectTypes = read(
      "src/modules/project_workspace/domain/project.ts",
    );

    expect(batchBar).toContain("useBatchBarController");
    expect(batchBar).toContain("<BatchBarView controller={controller} />");
    expect(batchBar).not.toContain("RenderModelSelect");
    expect(batchBarController).toContain("queries.useRenderSettings");
    expect(batchBarController).toContain("queries.useUpdateRenderSettings");
    expect(batchBarView).toContain("BatchBarModelSelect");
    expect(batchBarView).toContain("episode.renderSettings.model");
    expect(productionGateway).toContain("render-settings");
    expect(queryKeys).toContain("renderSettings");

    expect(productionGateway).toContain("image_generation_selection");
    expect(productionGateway).toContain("sketch_aspect_padding");
    expect(projectTypes).toContain("render_image_selection?: string");
    expect(projectTypes).toContain("sketch_aspect_padding?: boolean");
    expect(batchBarController).not.toContain("sketchAspectPadding");
    expect(batchBarController).not.toContain("render-sketch-aspect-padding");
    expect(batchBarController).not.toContain("forceHalfK");
    expect(batchBarController).not.toContain("force_half_k");
    expect(productionGateway).not.toContain("forceHalfK");
    expect(productionGateway).not.toContain("force_half_k");
    expect(projectTypes).not.toContain("force_half_k?: boolean");
  });

  it("exposes sketch and render upload actions instead of disabled placeholders", () => {
    const sketchSection = read("src/components/episode/beat-workbench/sketch-section.tsx");
    const sketchSectionView = read(
      "src/modules/production/presentation/SketchSectionView.tsx",
    );
    const renderSection = read("src/components/episode/beat-workbench/render-section.tsx");
    const renderSectionView = read(
      "src/modules/production/presentation/RenderSectionView.tsx",
    );
    const productionPublic = read("src/modules/production/public.ts");
    const productionGateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );

    expect(productionPublic).toContain("useUploadBeatImage");
    expect(productionGateway).toContain(
      "beats/${beatNumber}/${imageType}/upload",
    );

    expect(sketchSection).not.toContain('title={t("common.comingSoon")}');
    expect(sketchSectionView).not.toContain('title={t("common.comingSoon")}');
    expect(renderSection).not.toContain('title={t("common.comingSoon")}');
    expect(renderSectionView).not.toContain('title={t("common.comingSoon")}');
    expect(sketchSectionView).toContain('type="file"');
    expect(renderSectionView).toContain('type="file"');
  });
});
