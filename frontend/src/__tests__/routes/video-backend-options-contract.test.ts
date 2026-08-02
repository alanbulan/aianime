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

  it("supports the Grok Video inspector from backend capabilities", () => {
    const videoPaneController = read(
      "src/modules/production/application/use-video-pane-controller.ts",
    );
    const seedance2ConfigView = read(
      "src/modules/production/presentation/Seedance2ConfigView.tsx",
    );
    const modelDomain = read("src/modules/production/domain/video-model.ts");
    const videoConfig = read("src/modules/production/domain/video-config.ts");

    expect(modelDomain).toContain('normalized.includes("grokvideo")');
    expect(videoPaneController).toContain("showGrokVideoConfig");
    expect(seedance2ConfigView).toContain("Grok Video 检视器");
    expect(videoConfig).toContain('"3:2"');
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
