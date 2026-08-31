// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf-8");
const routeSource = read("src/routes/_app/projects.$project/episodes.tsx");
const pageControllerSource = read(
  "src/modules/narrative_planning/application/use-episodes-page-controller.ts",
);
const itemControllerSource = read(
  "src/modules/narrative_planning/application/use-episode-list-item-controller.ts",
);
const workspaceCompositionSource = read(
  "src/app/workspace-composition.tsx",
);
const viewSource = read(
  "src/modules/narrative_planning/presentation/EpisodesPageView.tsx",
);

describe("episodes workbench integration", () => {
  it("keeps the route limited to URL and Outlet adaptation", () => {
    expect(routeSource).toContain("EpisodesPageContent");
    expect(routeSource).toContain("Route.useParams()");
    expect(routeSource).toContain("<Outlet />");
    expect(routeSource).not.toContain("useEpisodes");
    expect(routeSource).not.toContain("usePlanEpisodes");
    expect(routeSource).not.toContain("useTaskController");
    expect(routeSource).not.toContain("useGenerationCreditCost");
  });

  it("wires NiceGUI-style stats and manual refresh into the episode list", () => {
    expect(pageControllerSource).toContain("deriveEpisodeStats");
    expect(pageControllerSource).toContain("handleRefresh");
    expect(viewSource).toContain("EpisodeStatsStrip");
    expect(viewSource).toContain("episode.list.stats.totalEpisodes");
    expect(viewSource).toContain("episode.list.refresh");
  });

  it("wires list-card identity, scene, and prop planning shortcuts", () => {
    expect(itemControllerSource).toContain("queries.usePlanIdentities");
    expect(itemControllerSource).toContain("queries.usePlanEpisodeScenes");
    expect(itemControllerSource).toContain("queries.usePlanEpisodeProps");
    expect(itemControllerSource).toContain('taskType: "identity_planner"');
    expect(viewSource).toContain("onClick={handlePlanScenes}");
    expect(viewSource).toContain("onClick={handlePlanProps}");
    expect(viewSource).toContain("episode.list.planIdentities");
    expect(viewSource).toContain("episode.list.planScenes");
    expect(viewSource).toContain("episode.list.planProps");
  });

  it("does not retain the retired local billing UI", () => {
    const sources = [
      pageControllerSource,
      itemControllerSource,
      workspaceCompositionSource,
      viewSource,
    ].join("\n");

    expect(sources).not.toContain("BillingRuleNotConfiguredError");
    expect(sources).not.toContain("CreditCostInline");
    expect(sources).not.toContain("CostDisplay");
    expect(sources).not.toContain("useGenerationCreditCost");
  });

  it("surfaces backend errors for scene and prop planning", () => {
    expect(itemControllerSource).toMatch(
      /const handlePlanScenes[\s\S]*backendErrorToastMessage\(response\.error, t\)[\s\S]*catch \(error\)[\s\S]*backendErrorToastMessage\(error, t\)/,
    );
    expect(itemControllerSource).toMatch(
      /const handlePlanProps[\s\S]*backendErrorToastMessage\(response\.error, t\)[\s\S]*catch \(error\)[\s\S]*backendErrorToastMessage\(error, t\)/,
    );
  });

  it("keeps list-card planning spinners running until async tasks finish", () => {
    expect(itemControllerSource).toContain(
      "planIdentities.isPending || identityTask.started",
    );
    expect(itemControllerSource).toContain(
      "planScenes.isPending || sceneTask.started",
    );
    expect(itemControllerSource).toContain(
      "planProps.isPending || propTask.started",
    );
    expect(itemControllerSource).toContain(
      "TASK_TYPES.EPISODE_SCENE_PLANNER",
    );
    expect(itemControllerSource).toContain(
      "TASK_TYPES.EPISODE_PROP_PLANNER",
    );
    expect(itemControllerSource).toContain(
      "sceneTask.start({ scope: response.scope })",
    );
    expect(itemControllerSource).toContain(
      "propTask.start({ scope: response.scope })",
    );
  });

  it("shows only one episode planning action for the list state", () => {
    expect(viewSource).toContain(
      "showPlan={!selectedEpisode && displayEpisodes.length === 0}",
    );
    expect(viewSource).toContain(
      "showReplan={!selectedEpisode && displayEpisodes.length > 0}",
    );
  });

  it("uses localized copy for the episode detail back action", () => {
    expect(viewSource).toContain('t("episode.list.backToEpisodes")');
    expect(viewSource).not.toContain("返回剧集列表");
  });
});
