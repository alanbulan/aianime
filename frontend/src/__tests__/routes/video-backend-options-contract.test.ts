// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("video backend options alignment", () => {
  it("does not hardcode the VideoPane backend list", () => {
    const videoPane = read("src/components/episode/beat-workbench/video-pane.tsx");
    const videoPaneController = read(
      "src/modules/production/application/use-video-pane-controller.ts",
    );

    expect(videoPane).not.toContain("const VIDEO_BACKENDS");
    expect(videoPane).toContain("useVideoPaneController");
    expect(videoPaneController).toContain("queries.useVideoBackends");
  });

  it("preserves dialogue-only capability metadata in the Production domain", () => {
    const backendDomain = read("src/modules/production/domain/video-backend.ts");

    expect(backendDomain).toContain("dialogue_only");
  });

  it("supports the Grok Video inspector from backend capabilities", () => {
    const videoPaneController = read(
      "src/modules/production/application/use-video-pane-controller.ts",
    );
    const seedance2ConfigView = read(
      "src/modules/production/presentation/Seedance2ConfigView.tsx",
    );
    const backendDomain = read("src/modules/production/domain/video-backend.ts");
    const videoConfig = read("src/modules/production/domain/video-config.ts");

    expect(backendDomain).toContain("is_grok_video");
    expect(videoPaneController).toContain("showGrokVideoConfig");
    expect(seedance2ConfigView).toContain("Grok Video 检视器");
    expect(videoConfig).toContain('"3:2"');
  });

  it("defaults to the ST2 canonical video backend instead of legacy comfyui", () => {
    const composition = read("src/modules/narrative_planning/composition.ts");
    const beatsController = read(
      "src/modules/narrative_planning/application/use-beats-page-controller.ts",
    );
    const backendDomain = read("src/modules/production/domain/video-backend.ts");

    expect(composition).toContain(
      "defaultVideoBackend: DEFAULT_VIDEO_BACKEND",
    );
    expect(beatsController).toContain("dependencies.defaultVideoBackend");
    expect(backendDomain).toContain("huimeng_seedance-1.0-pro-fast");
    expect(backendDomain).not.toContain("comfyui");
  });
});
