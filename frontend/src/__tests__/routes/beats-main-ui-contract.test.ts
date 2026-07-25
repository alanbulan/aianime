// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const route = read(
  "src/routes/_app/projects.$project/episodes.$episode/beats.lazy.tsx",
);
const controller = read(
  "src/modules/narrative_planning/application/use-beats-page-controller.ts",
);
const sketchPlanController = read(
  "src/modules/narrative_planning/application/use-beats-sketch-plan-controller.ts",
);
const sketchStudioController = read(
  "src/modules/narrative_planning/application/use-sketch-studio-controller.ts",
);
const view = read(
  "src/modules/narrative_planning/presentation/BeatsPageView.tsx",
);
const sketchStudioView = read(
  "src/modules/narrative_planning/presentation/SketchStudioActionsView.tsx",
);
const pageSources = `${controller}\n${sketchPlanController}\n${sketchStudioController}\n${view}\n${sketchStudioView}`;

describe("beats workbench v2-storage sketch-studio contract", () => {
  it("keeps the Beats route limited to URL adaptation", () => {
    expect(route).toContain("BeatsPageContent");
    expect(route).toContain("Route.useParams()");
    expect(route).toContain("useBeatsWorkbenchParam()");
    expect(route).not.toContain("useEpisodeBeats");
    expect(route).not.toContain("useGenerateScript");
    expect(route).not.toContain("useGenerationCreditCost");
  });

  it("keeps the main branch split shell and exposes grid galleries as dialogs", () => {
    expect(view).toContain("<BatchBar");
    expect(view).toContain("<ViewToggles");
    expect(view).toContain("data-beats-split");
    expect(view).not.toContain("react-resizable-panels");
    expect(view).toContain("<BeatCardGrid");
    expect(view).toContain("<ActionPanel");
    expect(view.indexOf("<ViewToggles")).toBeGreaterThan(
      view.indexOf("data-beats-split"),
    );
    expect(view.indexOf("<BeatCardGrid")).toBeGreaterThan(
      view.indexOf("<ViewToggles"),
    );
    expect(view.indexOf("<ActionPanel")).toBeGreaterThan(
      view.indexOf("<BeatCardGrid"),
    );

    const mainLayout = view.slice(view.indexOf("return ("));
    const beforeSplit = mainLayout.slice(
      0,
      mainLayout.indexOf('<div className="min-h-0 flex-1 overflow-hidden">'),
    );
    expect(beforeSplit).not.toContain("<SketchGridGallery");
    expect(beforeSplit).not.toContain("<RenderGridGallery");

    expect(view).not.toContain("sceneGalleryOpen");
    expect(view).toContain("gridGalleryOpen");
    expect(view).toContain("renderGridGalleryOpen");
    expect(view).not.toContain("<SketchSceneGallery");
    expect(view).toContain("<SketchGridGallery");
    expect(view).toContain("<RenderGridGallery");
    expect(view).toContain("max-w-none");
  });

  it("does not collapse the right action panel when users switch beats", () => {
    expect(view).toContain("onCardClick={handleCardClick}");
    expect(view).not.toContain("setCardCollapseKey");
    expect(view).not.toContain("collapseKey={");
  });

  it("keeps multi-select redraw commands in the ViewToggles row", () => {
    const viewToggles = read(
      "src/components/episode/beat-workbench/view-toggles.tsx",
    );
    const batchBar = read(
      "src/components/episode/beat-workbench/batch-bar.tsx",
    );
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchBarSources = `${batchBar}\n${batchBarController}\n${batchBarView}`;

    expect(viewToggles).toContain("onBatchRegenSketch");
    expect(viewToggles).toContain("onBatchRegenRender");
    expect(viewToggles).toContain(
      "episode.workbench.view.batchRegenSketch",
    );
    expect(viewToggles).toContain(
      "episode.workbench.view.batchRegenRender",
    );
    expect(view).toContain("onBatchRegenSketch={openSketchPlan}");
    expect(view).toContain("onBatchRegenRender={openRenderPlan}");
    expect(view).toContain("<RenderPlanDialog");
    expect(sketchPlanController).toContain(
      "dependencies.createSketchPlanItems",
    );
    expect(pageSources).not.toContain("useRegenerateRenderBeats");
    expect(pageSources).not.toContain("bestFitMode(SKETCH_REGEN_MODES");

    expect(batchBarSources).not.toContain("checkedBeats");
    expect(batchBarSources).not.toContain("dispatchSelectedSketchItems");
    expect(batchBarSources).not.toContain("episode.workbench.batch.singleRegen");
    expect(batchBarSources).not.toContain("episode.workbench.batch.autoCombine");
  });

  it("does not let stale URL beat deep-links overwrite restored workbench state", () => {
    expect(controller).toContain('selection.mode !== "none"');
    expect(controller).not.toContain("activeBeat !== null");
    expect(controller).toContain("appliedDeepLinkRef");
  });

  it("shows the sketch grid gallery for all projects while render grids stay narrated-only", () => {
    expect(controller).toContain('spine_template === "narrated"');
    expect(view).not.toContain(
      "showGridGalleryActions={isNarratedProject}",
    );
    expect(view).toContain(
      "onOpenGridGallery={() => setGridGalleryOpen(true)}",
    );
    expect(view).toContain("onOpenRenderGridGallery={");
    expect(view).toContain("isNarratedProject");
    expect(view).toContain(": undefined");
    expect(sketchStudioView).toContain("showGridGalleryActions");
    expect(sketchStudioView).toContain("showGridGalleryActions &&");
    expect(sketchStudioController).toContain("queries.useScript");
    expect(sketchStudioController).toContain("dependencies.useCharacters");
    expect(view).toContain("controller={sketchStudio}");
  });

  it("keeps image pool rebuild available outside narrated-only gallery actions", () => {
    expect(controller).toContain("dependencies.useRebuildPoolIndex");
    expect(controller).toContain("handleRebuildPoolIndex");
    expect(view).toContain("episode.workbench.pool.rebuildIndex");
    expect(view).not.toContain(
      "showGridGalleryActions={isNarratedProject}\n                    onRebuildPoolIndex",
    );
  });

  it("keeps the episode-level Freezone entry hidden in the beats workbench", () => {
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(view).toContain("const SHOW_EPISODE_FREEZONE_ENTRY = false");
    expect(controller).toContain("handleOpenEpisodeFreezone");
    expect(controller).toContain("openingEpisodeFreezone");
    expect(controller).toContain('scope: "episode"');
    expect(view).toContain("SHOW_EPISODE_FREEZONE_ENTRY &&");
    expect(view).not.toContain(">EP Freezone<");
    expect(zh).toContain("episodeFreezone");
    expect(en).toContain("episodeFreezone");
  });

  it("shows the audio media status only for narrated projects", () => {
    const actionPanel = read(
      "src/components/episode/beat-workbench/action-panel.tsx",
    );
    const singleBeatPanel = read(
      "src/components/episode/beat-workbench/single-beat-panel.tsx",
    );
    const videoPane = read(
      "src/components/episode/beat-workbench/video-pane.tsx",
    );
    const videoPaneView = read(
      "src/modules/production/presentation/VideoPaneView.tsx",
    );
    const seedance2ConfigView = read(
      "src/modules/production/presentation/Seedance2ConfigView.tsx",
    );

    expect(view).toContain("showAudioMediaStatus={isNarratedProject}");
    expect(actionPanel).toContain("showAudioMediaStatus");
    expect(singleBeatPanel).toContain("showAudioMediaStatus");
    expect(videoPane).toContain("showAudioMediaStatus={showAudioMediaStatus}");
    expect(videoPaneView).toContain(
      "showAudioMediaStatus={showAudioMediaStatus}",
    );
    expect(seedance2ConfigView).toContain("showAudioMediaStatus &&");
  });

  it("persists the video backend through project config instead of local-only storage", () => {
    expect(controller).toContain("dependencies.useProject(project)");
    expect(controller).toContain("dependencies.useUpdateProject(project)");
    expect(controller).toContain("projectConfig.data?.video_backend");
    expect(controller).toContain("handleVideoBackendChange");
    expect(controller).toContain("video_backend: backend");
    expect(controller).not.toContain("useVideoBackends");
    expect(view).not.toContain("isSeedance2Backend");
    expect(pageSources).not.toContain('"video-backend"');
  });

  it("hydrates and persists project aspect ratio through project config", () => {
    const projectTypes = read(
      "src/modules/project_workspace/domain/project.ts",
    );

    expect(projectTypes).toContain(
      'aspect_ratio?: "2:3" | "9:16" | "16:9"',
    );
    expect(controller).toContain("orientationForAspectRatio");
    expect(controller).toContain("projectConfig.data?.aspect_ratio");
    expect(controller).toContain(
      "aspect_ratio: aspectRatioForOrientation",
    );
  });

  it("keeps Director Render video first-frame compatibility off the visible React UI", () => {
    const batchBar = read(
      "src/components/episode/beat-workbench/batch-bar.tsx",
    );
    const batchBarView = read(
      "src/modules/production/presentation/BatchBarView.tsx",
    );
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchBarSources = `${batchBar}\n${batchBarController}\n${batchBarView}`;
    const actionPanel = read(
      "src/components/episode/beat-workbench/action-panel.tsx",
    );
    const singleBeatPanel = read(
      "src/components/episode/beat-workbench/single-beat-panel.tsx",
    );
    const batchPanel = read(
      "src/components/episode/beat-workbench/batch-panel.tsx",
    );
    const videoPane = read(
      "src/components/episode/beat-workbench/video-pane.tsx",
    );
    const videoGeneration = read(
      "src/modules/production/domain/video-generation.ts",
    );
    const productionVideoGateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );
    const projectTypes = read(
      "src/modules/project_workspace/domain/project.ts",
    );

    expect(projectTypes).toContain("use_director_render?: boolean");
    expect(videoGeneration).toContain("useDirectorRender?: boolean");
    expect(productionVideoGateway).toContain(
      "use_director_render: command.useDirectorRender",
    );
    expect(pageSources).not.toContain("handleUseDirectorRenderChange");
    expect(view).not.toContain("useDirectorRender={useDirectorRender}");
    expect(batchBarSources).not.toContain("useDirectorRender");
    expect(batchBarSources).not.toContain("onUseDirectorRenderChange");
    expect(batchBarSources).not.toContain(
      "episode.workbench.batch.useDirectorRender",
    );
    expect(actionPanel).not.toContain("useDirectorRender");
    expect(singleBeatPanel).not.toContain("useDirectorRender");
    expect(batchPanel).not.toContain("useDirectorRender");
    expect(videoPane).not.toContain("useDirectorRender");
  });
});
