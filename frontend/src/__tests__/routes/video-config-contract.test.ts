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

describe("VideoReference minimal config alignment", () => {
  it("keeps video_config_json on Beat and BeatUpdate", () => {
    const narrativeTypes = read(
      "src/modules/narrative_planning/domain/types.ts",
    );

    expect(
      narrativeTypes.match(/video_config_json\?: string/g),
    ).toHaveLength(2);
  });

  it("shows and saves minimal VideoReference config from the video pane", () => {
    const videoPane = readVideoPaneComposition();
    const videoPaneController = read(
      "src/modules/production/application/use-video-pane-controller.ts",
    );
    const configController = read(
      "src/modules/production/application/use-beat-video-config-controller.ts",
    );
    const configView = read(
      "src/modules/production/presentation/BeatVideoConfigView.tsx",
    );

    expect(videoPane).toContain("useVideoPaneController");
    expect(videoPane).toContain("useUpdateBeat");
    expect(videoPaneController).toContain("config.draft.final_prompt");
    expect(configController).toContain("video_config_json");
    expect(configView).toContain("videoReferencePrompt");
  });
});
