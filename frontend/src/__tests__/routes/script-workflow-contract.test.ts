// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const scriptRoute = read(
  "src/routes/_app/projects.$project/episodes.$episode/script.lazy.tsx",
);
const scriptController = read(
  "src/modules/narrative_planning/application/use-script-page-controller.ts",
);
const scriptView = read(
  "src/modules/narrative_planning/presentation/ScriptPageView.tsx",
);
const scriptComposition = read(
  "src/modules/narrative_planning/composition.ts",
);
const scriptPageSources = [
  scriptRoute,
  scriptController,
  scriptView,
  scriptComposition,
].join("\n");

describe("script workflow canonical contract", () => {
  it("uses script_writer and /script/generate for beats empty-state generation", () => {
    const route = read(
      "src/routes/_app/projects.$project/episodes.$episode/beats.lazy.tsx",
    );

    expect(route).toContain("useGenerateScript");
    expect(route).toContain("useEpisodeDetail");
    expect(route).toContain("identityPlanReady");
    expect(route).toContain("episode.script.identityRequired");
    expect(route).toContain(
      'useGenerationCreditCost("feature", "script_writer")',
    );
    expect(route).toContain(
      "generateScriptCost.error instanceof BillingRuleNotConfiguredError",
    );
    expect(route).toMatch(
      /<CreditCostInline\s+display=\{generateScriptCostDisplay\}/,
    );
    expect(route).toContain("backendErrorToastMessage(err, t)");
    expect(route).toContain('taskType: "script_writer"');
    expect(route).toContain('alsoReconcile: ["literal_script_writer"]');
    expect(route).not.toContain("useGenerateLiteralScript");
    expect(route).not.toContain('taskType: "literal_script_writer"');
  });

  it("keeps the Script route limited to route parameter adaptation", () => {
    expect(scriptRoute).toContain("ScriptPageContent");
    expect(scriptRoute).toContain("Route.useParams()");
    expect(scriptRoute).not.toContain("useEpisodeDetail");
    expect(scriptRoute).not.toContain("useGenerateScript");
    expect(scriptRoute).not.toContain("useTaskController");
    expect(scriptRoute).not.toContain("useGenerationCreditCost");
  });

  it("exposes the v2-storage NiceGUI script workbench controls", () => {
    expect(scriptController).toContain("queries.useEpisodeDetail");
    expect(scriptController).toContain("dependencies.useProject");
    expect(scriptController).toContain("beat_source_text");
    expect(scriptController).toContain("queries.useGenerateScript");
    expect(scriptController).toContain('"script_writer"');
    expect(scriptController).toContain("BillingRuleNotConfiguredError");
    expect(scriptView).toMatch(
      /<CreditCostInline\s+display=\{generateScriptCostDisplay\}/,
    );
    expect(scriptController).toContain("queries.useGenerateRewrite");
    expect(scriptController).toContain('spine_template === "narrated"');
    expect(scriptController).toContain("initializedSourceRef");
    expect(scriptController).toContain("ensureBeatSourceText");
    expect(scriptController).toContain("handleGenerateRewrite");
    expect(scriptController).toContain("scriptTask.start");
    expect(scriptController).toContain("scriptTask.stop");
    expect(scriptController).toContain("const identityTask = useTaskController");
    expect(scriptController).toContain("TASK_TYPES.IDENTITY_PLANNER");
    expect(scriptController).toContain("identityTask.start");
    expect(scriptController).toContain("getScriptReviewFeedback");
    expect(scriptController).toContain("showCompleteToast: false");
    expect(scriptPageSources).toContain("generateScript");
    expect(scriptPageSources).toContain("generateRewrite");
    expect(scriptPageSources).not.toContain("handleRefreshScript");
    expect(scriptPageSources).not.toContain("handleLoadScript");
    expect(scriptPageSources).not.toContain("getScriptReloadFeedback");
    expect(scriptPageSources).not.toContain("refreshScript");
    expect(scriptPageSources).not.toContain("loadScript");
    expect(scriptPageSources).not.toContain("FolderOpen");
    expect(scriptView).toContain("modeLiteral");
    expect(scriptPageSources).not.toContain("useRawContent");
    expect(scriptPageSources).not.toContain("useAdaptedContent");
    expect(scriptPageSources).not.toContain("useGenerateStaging");
    expect(scriptPageSources).not.toContain("CONTENT_REWRITER");
    expect(scriptPageSources).not.toContain('value="json"');
  });

  it("keeps unsupported main-branch script endpoints out of the v2-storage query layer", () => {
    const queries = [
      read("src/modules/narrative_planning/application/query-hooks.ts"),
      read(
        "src/modules/narrative_planning/infrastructure/http-narrative-planning-gateway.ts",
      ),
    ].join("\n");
    const queryKeys = read("src/lib/query-keys.ts");

    expect(queries).not.toContain("useGenerateLiteralScript");
    expect(queries).not.toContain("usePolishPatches");
    expect(queries).not.toContain("useRawContent");
    expect(queries).not.toContain("useAdaptedContent");
    expect(queries).not.toContain("useSaveAdaptedContent");
    expect(queries).not.toContain("useDeleteAdaptedContent");
    expect(queries).not.toContain("useGenerateStaging");

    expect(queries).not.toContain("literal-script/generate");
    expect(queries).not.toContain("raw-content");
    expect(queries).not.toContain("adapted-content");
    expect(queries).toContain("useGenerateRewrite");
    expect(queries).toContain("rewrite/generate");
    expect(queries).not.toContain("staging/generate");
    expect(queries).not.toContain("polish-patches");

    expect(queryKeys).not.toContain("raw-content");
    expect(queryKeys).not.toContain("adapted-content");
  });

  it("uses script review feedback for Script tab completion", () => {
    expect(scriptController).toContain("getScriptReviewFeedback");
    expect(scriptController).toContain("showCompleteToast: false");
  });

  it("passes narrated rewrite line count and character range controls to the API", () => {
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(scriptController).toContain("rewriteTargetBeats");
    expect(scriptController).toContain("rewriteBeatCharsMin");
    expect(scriptController).toContain("rewriteBeatCharsMax");
    expect(scriptView).toContain("episode.script.rewriteTargetBeats");
    expect(scriptView).toContain("episode.script.rewriteBeatCharsMin");
    expect(scriptView).toContain("episode.script.rewriteBeatCharsMax");
    expect(scriptController).toContain("target_beats: rewriteTargetBeats");
    expect(scriptController).toContain("beat_chars_min: rewriteBeatCharsMin");
    expect(scriptController).toContain("beat_chars_max: rewriteBeatCharsMax");
    expect(scriptController).not.toContain("generateRewrite.mutateAsync({})");
    expect(zh).toContain('"rewriteTargetBeats"');
    expect(zh).toContain('"rewriteBeatCharsMin"');
    expect(zh).toContain('"rewriteBeatCharsMax"');
    expect(en).toContain('"rewriteTargetBeats"');
    expect(en).toContain('"rewriteBeatCharsMin"');
    expect(en).toContain('"rewriteBeatCharsMax"');
  });

  it("surfaces backend task admission errors for script planning actions", () => {
    expect(scriptController).toContain("backendErrorToastMessage");
    expect(scriptController).toMatch(
      /const handlePlanIdentities[\s\S]*backendErrorToastMessage\(response\.error, t\)[\s\S]*catch \(error\)[\s\S]*backendErrorToastMessage\(error, t\)/,
    );
    expect(scriptController).toMatch(
      /const handlePlanScenes[\s\S]*backendErrorToastMessage\(response\.error, t\)[\s\S]*catch \(error\)[\s\S]*backendErrorToastMessage\(error, t\)/,
    );
    expect(scriptController).toMatch(
      /const handlePlanProps[\s\S]*backendErrorToastMessage\(response\.error, t\)[\s\S]*catch \(error\)[\s\S]*backendErrorToastMessage\(error, t\)/,
    );
  });
});
