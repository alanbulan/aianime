// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function readVideoPaneComposition() {
  const source = read("src/modules/production/video-pane-composition.ts");
  return source.slice(source.indexOf("export interface VideoPaneProps"));
}

describe("video model options alignment", () => {
  it("does not hardcode the VideoPane model list", () => {
    const videoPane = readVideoPaneComposition();
    const videoPaneController = read(
      "src/modules/production/application/use-video-pane-controller.ts",
    );

    expect(videoPane).not.toContain("const VIDEO_BACKENDS");
    expect(videoPane).toContain("useVideoPaneController");
    expect(videoPaneController).toContain("queries.useVideoModels");
  });

  it("preserves dialogue-only capability metadata in the Production domain", () => {
    const modelDomain = read("src/modules/production/domain/video-model.ts");

    expect(modelDomain).toContain("capabilities.dialogueOnly");
  });

  it("selects the reference inspector from backend workflow capabilities", () => {
    const videoPaneController = read(
      "src/modules/production/application/use-video-pane-controller.ts",
    );
    const videoReferenceConfigView = read(
      "src/modules/production/presentation/BeatVideoConfigView.tsx",
    );
    const modelDomain = read("src/modules/production/domain/video-model.ts");
    expect(modelDomain).toContain("capabilities.videoWorkflow");
    expect(modelDomain).toContain('"advanced-reference"');
    expect(modelDomain).toContain('"reference"');
    expect(videoPaneController).toContain(
      'selectedModel?.workflow === "reference"',
    );
    expect(videoPaneController).toContain("showReferenceVideoConfig");
    expect(videoReferenceConfigView).toContain("showReferenceVideoConfig");
    expect([modelDomain, videoPaneController, videoReferenceConfigView].join("\n"))
      .not.toMatch(/grok|seedance|happyhorse/i);
  });

  it("uses the authenticated VIDEO catalog without a static fallback", () => {
    const composition = read("src/modules/narrative_planning/composition.ts");
    const beatsController = read(
      "src/modules/narrative_planning/application/use-beats-page-controller.ts",
    );
    const modelDomain = read("src/modules/production/domain/video-model.ts");

    expect(composition).toContain("useVideoModels");
    expect(composition).not.toContain("DEFAULT_VIDEO_BACKEND");
    expect(beatsController).toContain("resolveAuthorizedVideoModel(");
    expect(beatsController).not.toContain("defaultVideoModel");
    expect(modelDomain).not.toContain("comfyui");
  });
});
