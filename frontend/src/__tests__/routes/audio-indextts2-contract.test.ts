// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("audio IndexTTS2 alignment contract", () => {
  it("does not expose legacy TTS voices, preview, or tts/generate calls in active FE code", () => {
    const productionGateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );
    const audioPane = [
      read("src/modules/production/application/use-audio-pane-controller.ts"),
      read("src/modules/production/presentation/AudioPaneView.tsx"),
    ].join("\n");

    expect(productionGateway).not.toContain("/tts/voices");
    expect(productionGateway).not.toContain("/tts/preview");
    expect(productionGateway).not.toContain("/tts/generate");
    expect(audioPane).not.toContain("useTTSVoices");
    expect(audioPane).not.toContain("usePreviewTTS");
  });

  it("uses audio_generation_indextts2 as the active audio task type", () => {
    const taskTypes = read("src/modules/task_execution/domain/taskTypes.ts");
    const stageRegistry = read("src/lib/episode-stage-registry.ts");
    const batchBarController = read(
      "src/modules/production/application/use-batch-bar-controller.ts",
    );
    const batchPanelController = read(
      "src/modules/production/application/use-batch-panel-controller.ts",
    );

    expect(taskTypes).toContain(
      'AUDIO_GENERATION_INDEXTTS2: "audio_generation_indextts2"',
    );
    expect(stageRegistry).toContain("TASK_EPISODE_STAGES.audio");
    expect(batchBarController).toContain(
      "TASK_TYPES.AUDIO_GENERATION_INDEXTTS2",
    );
    expect(batchPanelController).toContain(
      "TASK_TYPES.AUDIO_GENERATION_INDEXTTS2",
    );
  });

  it("dispatches selected beat audio as one async task instead of patching audio_url synchronously", () => {
    const productionGateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );
    const batchPanelController = read(
      "src/modules/production/application/use-batch-panel-controller.ts",
    );
    const audioHandler = batchPanelController.match(
      /const onBatchAudio = async \(\) => \{[\s\S]*?\n    \};/,
    )?.[0] ?? "";

    expect(productionGateway).not.toContain("audio_url");
    expect(audioHandler).not.toContain("let ok = 0");
    expect(audioHandler).not.toContain("for (const beatNum of beatList)");
    expect(audioHandler).toContain("beatNumbers,");
  });
});
