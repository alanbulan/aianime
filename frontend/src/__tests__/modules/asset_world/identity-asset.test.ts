// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

const apiCall = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiCall }));

import {
  createIdentityAsset,
  type IdentityAssetGateway,
} from "@/modules/asset_world/application/identity-asset";
import { httpIdentityAssetGateway } from "@/modules/asset_world/infrastructure/http-identity-asset-gateway";
import type {
  CreateIdentityAssetPayload,
  CreateIdentityAssetResult,
} from "@/modules/asset_world/public";

const payload = {
  source_url: "/static/projects/demo/freezone/output.png",
  character: "Alice",
  identity_name: "worker",
  appearance_details: "blue uniform",
  face_prompt: "mature face",
  age_group: "middle",
} satisfies CreateIdentityAssetPayload;

const created = {
  character: "Alice",
  identity_id: "worker",
  identity_name: "worker",
  target_path: "assets/characters/Alice/identities/worker/reference.png",
  target_url: "/static/projects/demo/assets/characters/Alice/identities/worker/reference.png",
} satisfies CreateIdentityAssetResult;

afterEach(() => {
  apiCall.mockReset();
});

describe("identity asset creation", () => {
  it("delegates the command through the application gateway", async () => {
    const create = vi.fn().mockResolvedValue(created);
    const gateway: IdentityAssetGateway = { create };
    const params = { projectId: "demo", payload };

    await expect(createIdentityAsset(params, gateway)).resolves.toBe(created);
    expect(create).toHaveBeenCalledWith(params);
  });

  it("maps the command to the canonical Freezone identity endpoint", async () => {
    apiCall.mockResolvedValueOnce(created);

    await expect(
      httpIdentityAssetGateway.create({
        projectId: "demo project",
        payload,
      }),
    ).resolves.toBe(created);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/demo%20project/freezone/assets/identities",
      { method: "POST", json: payload },
    );
  });
});
