// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const controller = read(
  "src/modules/narrative_planning/application/use-script-page-controller.ts",
);
const view = read(
  "src/modules/narrative_planning/presentation/ScriptPageView.tsx",
);
const scriptPageSources = `${controller}\n${view}`;

describe("script route source editor integration", () => {
  it("mounts the episode source editor and saves beat_source_text", () => {
    expect(view).toContain("EpisodeSourceEditor");
    expect(controller).toContain("beat_source_text");
    expect(controller).toContain("saveScopes.episodeSource");
  });

  it("mounts the beat-level script preview from episode beats", () => {
    expect(controller).toContain("queries.useEpisodeBeats");
    expect(view).toContain("ScriptBeatPreview");
    expect(view).toContain("episode.script.previewTitle");
  });

  it("keeps the episode story context panel hidden on the script page", () => {
    expect(scriptPageSources).not.toContain("EpisodeStoryContext");
    expect(scriptPageSources).not.toContain("content_summary");
    expect(scriptPageSources).not.toContain("key_events");
    expect(scriptPageSources).not.toContain("cliffhanger");
  });

  it("mounts episode scene and prop planning from detail menus", () => {
    expect(view).toContain("EpisodeAssetPlanning");
    expect(controller).toContain("queries.usePlanEpisodeScenes");
    expect(controller).toContain("queries.usePlanEpisodeProps");
    expect(controller).toContain("scene_menu");
    expect(controller).toContain("prop_menu");
    expect(view).toContain("project={project}");
  });

  it("shows feature credit cost on detail scene and prop planning", () => {
    const planning = read(
      "src/components/episode/episode-asset-planning.tsx",
    );

    expect(controller).toContain('"episode_scene_planner"');
    expect(controller).toContain('"episode_prop_planner"');
    expect(controller).toContain("BillingRuleNotConfiguredError");
    expect(view).toContain("sceneCostDisplay={planScenesCostDisplay}");
    expect(view).toContain("propCostDisplay={planPropsCostDisplay}");
    expect(controller).toMatch(
      /const handlePlanScenes[\s\S]*backendErrorToastMessage\(response\.error, t\)[\s\S]*catch \(error\)[\s\S]*backendErrorToastMessage\(error, t\)/,
    );
    expect(controller).toMatch(
      /const handlePlanProps[\s\S]*backendErrorToastMessage\(response\.error, t\)[\s\S]*catch \(error\)[\s\S]*backendErrorToastMessage\(error, t\)/,
    );
    expect(planning).toContain("<CreditCostInline display={costDisplay} />");
  });

  it("shows feature credit cost on detail identity planning", () => {
    const picker = read("src/components/identity-picker-dialog.tsx");

    expect(controller).toContain('"identity_planner"');
    expect(controller).toContain("BillingRuleNotConfiguredError");
    expect(view).toContain("planCostDisplay={planIdentitiesCostDisplay}");
    expect(picker).toContain(
      "<CreditCostInline display={planCostDisplay} />",
    );
  });

  it("wires episode prop promotion labels into the planning area", () => {
    expect(view).toContain("episode.script.propInGlobal");
    expect(view).toContain("episode.script.promotePropTitle");
    expect(view).toContain("assets.props.types");
  });
});
