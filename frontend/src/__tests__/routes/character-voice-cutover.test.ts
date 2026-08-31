// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workbenchSource = [
  "src/modules/asset_world/presentation/CharactersPageView.tsx",
  "src/modules/asset_world/presentation/CharacterVoicePanelView.tsx",
  "src/modules/asset_world/application/use-character-voice-controller.ts",
]
  .map((path) => readFileSync(path, "utf-8"))
  .join("\n");
const characterTypes = readFileSync(
  "src/modules/asset_world/domain/character.ts",
  "utf-8",
);
const characterQueries = readFileSync(
  "src/modules/asset_world/application/character-query-hooks.ts",
  "utf-8",
);

describe("character workbench SpeechSynthesis cutover", () => {
  it("does not expose legacy Fish voice controls in the character workbench", () => {
    expect(workbenchSource).not.toContain("VOICE_TYPE_OPTIONS");
    expect(workbenchSource).not.toContain("characters.voice.");
    expect(workbenchSource).not.toContain("voiceOverride");
    expect(workbenchSource).not.toContain("fish-audio-voice-id");
    expect(workbenchSource).not.toContain("fish_voice_id");
  });

  it("uses SpeechSynthesis voice sample fields in frontend character types", () => {
    expect(characterTypes).not.toContain("fish_voice_id");
    expect(characterTypes).toContain("reference_audio_path");
    expect(characterTypes).toContain("reference_audio_url");
    expect(characterTypes).toContain("reference_audio_sha256");
    expect(characterTypes).toContain("reference_audio_updated_at");
    expect(characterTypes).toContain("voice_samples_by_age_group");
  });

  it("does not allow character query mutations to write fish_voice_id", () => {
    expect(characterQueries).not.toContain("fish_voice_id");
  });
});
