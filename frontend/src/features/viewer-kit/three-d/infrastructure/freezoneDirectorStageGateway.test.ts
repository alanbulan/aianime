// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiCall = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiCall }));

import { freezoneDirectorStageGateway } from "./freezoneDirectorStageGateway";

beforeEach(() => {
  apiCall.mockReset();
});

const target = { projectId: "project/one", episode: 2, beat: 7 };

describe("freezoneDirectorStageGateway", () => {
  it("loads the Beat overlay", async () => {
    apiCall.mockResolvedValue({ status: "missing" });

    await freezoneDirectorStageGateway.getOverlay(target);

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fone/episodes/2/beats/7/director-stage/overlay",
    );
  });

  it("saves the Beat overlay", async () => {
    const payload = { snapshot: {} };
    apiCall.mockResolvedValue({ status: "saved" });

    await freezoneDirectorStageGateway.saveOverlay(target, payload);

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fone/episodes/2/beats/7/director-stage/overlay",
      { method: "POST", json: payload },
    );
  });

  it("saves the Beat control frame", async () => {
    const payload = { images: {} };
    apiCall.mockResolvedValue({ dir: "" });

    await freezoneDirectorStageGateway.saveControlFrame(target, payload);

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fone/episodes/2/beats/7/director-stage/control-frame",
      { method: "POST", json: payload },
    );
  });

  it("generates an AI staging prop", async () => {
    const payload = { user_hint: "horse" };
    apiCall.mockResolvedValue({ prop: {} });

    await freezoneDirectorStageGateway.generateAiStagingProp(
      "project/one",
      payload,
    );

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fone/freezone/ai-staging-prop",
      { method: "POST", json: payload },
    );
  });
});
