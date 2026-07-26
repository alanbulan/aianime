// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateAiStagingProp,
  getBeatDirectorStageOverlay,
  saveBeatDirectorControlFrame,
  saveBeatDirectorStageOverlay,
  type BeatDirectorStageGateway,
} from "./directorStageOperations";

function createGateway(): BeatDirectorStageGateway {
  return {
    generateAiStagingProp: vi.fn().mockResolvedValue({ prop: { id: "prop-1" } }),
    getOverlay: vi.fn().mockResolvedValue({ status: "missing" }),
    saveControlFrame: vi.fn().mockResolvedValue({ rel_paths: {}, paths: {}, dir: "" }),
    saveOverlay: vi.fn().mockResolvedValue({ status: "saved" }),
  } as unknown as BeatDirectorStageGateway;
}

const target = { projectId: "project-1", episode: 2, beat: 7 };

describe("director stage operations", () => {
  it("loads the Beat overlay", async () => {
    const gateway = createGateway();

    await getBeatDirectorStageOverlay(target, gateway);

    expect(gateway.getOverlay).toHaveBeenCalledWith(target);
  });

  it("saves the Beat overlay payload", async () => {
    const gateway = createGateway();
    const payload = { snapshot: {} };

    await saveBeatDirectorStageOverlay(target, payload, gateway);

    expect(gateway.saveOverlay).toHaveBeenCalledWith(target, payload);
  });

  it("saves the Beat control-frame payload", async () => {
    const gateway = createGateway();
    const payload = { images: {} };

    await saveBeatDirectorControlFrame(target, payload, gateway);

    expect(gateway.saveControlFrame).toHaveBeenCalledWith(target, payload);
  });

  it("delegates AI staging prop generation", async () => {
    const gateway = createGateway();
    const payload = { user_hint: "horse" };

    await generateAiStagingProp("project-1", payload, gateway);

    expect(gateway.generateAiStagingProp).toHaveBeenCalledWith(
      "project-1",
      payload,
    );
  });
});
