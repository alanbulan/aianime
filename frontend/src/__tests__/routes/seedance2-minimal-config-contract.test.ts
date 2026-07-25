// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Seedance2 minimal config alignment", () => {
  it("keeps seedance2_config_json on Beat and BeatUpdate", () => {
    const narrativeTypes = read(
      "src/modules/narrative_planning/domain/types.ts",
    );

    expect(
      narrativeTypes.match(/seedance2_config_json\?: string/g),
    ).toHaveLength(2);
  });

  it("shows and saves minimal Seedance2 config from the video pane", () => {
    const videoPane = read("src/components/episode/beat-workbench/video-pane.tsx");
    const videoPaneController = read(
      "src/modules/production/application/use-video-pane-controller.ts",
    );
    const configController = read(
      "src/modules/production/application/use-seedance2-config-controller.ts",
    );
    const configView = read(
      "src/modules/production/presentation/Seedance2ConfigView.tsx",
    );

    expect(videoPane).toContain("useVideoPaneController");
    expect(videoPane).toContain("useUpdateBeat");
    expect(videoPaneController).toContain("config.draft.final_prompt");
    expect(configController).toContain("seedance2_config_json");
    expect(configView).toContain("seedance2Prompt");
  });
});
