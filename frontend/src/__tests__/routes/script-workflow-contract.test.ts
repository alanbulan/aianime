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
    const beatsController = read(
      "src/modules/narrative_planning/application/use-beats-page-controller.ts",
    );
    const beatsView = read(
      "src/modules/narrative_planning/presentation/BeatsPageView.tsx",
    );
    const beatsSources = `${beatsController}\n${beatsView}`;

    expect(beatsController).toContain("queries.useGenerateScript");
    expect(beatsController).toContain("queries.useEpisodeDetail");
    expect(beatsController).toContain("identityPlanReady");
    expect(beatsController).toContain("episode.script.identityRequired");
    expect(beatsController).toContain("TASK_TYPES.SCRIPT_WRITER");
    expect(beatsController).toContain(
      "backendErrorToastMessage(error, t)",
    );
    expect(beatsController).toContain("taskType: TASK_TYPES.SCRIPT_WRITER");
    expect(beatsController).toContain(
      "alsoReconcile: [TASK_TYPES.LITERAL_SCRIPT_WRITER]",
    );
    expect(beatsSources).not.toContain("useGenerateLiteralScript");
    expect(beatsSources).not.toContain(
      'taskType: "literal_script_writer"',
    );
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
    expect(scriptController).toContain("TASK_TYPES.SCRIPT_WRITER");
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
    expect(scriptView).toContain('value="duration"');
    expect(scriptView).toContain('value="literal"');
    expect(scriptView).toContain("rhythmDuration");
    expect(scriptView).toContain("rhythmLiteral");
    expect(scriptController).toContain("rhythm: scriptMode");
    expect(scriptController).toContain(
      "target_duration_total: targetDurationTotal",
    );
    expect(scriptPageSources).not.toContain("useRawContent");
    expect(scriptPageSources).not.toContain("useAdaptedContent");
    expect(scriptPageSources).not.toContain("useGenerateStaging");
    expect(scriptPageSources).not.toContain("CONTENT_REWRITER");
    expect(scriptPageSources).not.toContain('value="json"');
    expect(scriptPageSources).not.toContain("BillingRuleNotConfiguredError");
    expect(scriptPageSources).not.toContain("CreditCostInline");
    expect(scriptPageSources).not.toContain("generateScriptCostDisplay");
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
