// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const { commitProjectAsset, post, uploadProjectAsset } = vi.hoisted(() => ({
  commitProjectAsset: vi.fn(),
  post: vi.fn(),
  uploadProjectAsset: vi.fn(),
}));

vi.mock("@/shared/api/project-asset-transfer", () => ({
  commitProjectAsset,
  uploadProjectAsset,
}));
vi.mock("@/shared/api/transport", () => ({ api: { post } }));

import { httpPropGateway } from "@/modules/asset_world/infrastructure/http-prop-gateway";

describe("HTTP prop gateway", () => {
  beforeEach(() => {
    commitProjectAsset.mockReset();
    post.mockReset();
    uploadProjectAsset.mockReset();
  });

  it("uploads a reference source and commits it through the shared project asset transport", async () => {
    const file = new File(["prop"], "reference.png", { type: "image/png" });
    const uploaded = {
      url: "/static/projects/demo/freezone/uploads/reference.png",
      filename: "reference.png",
      size: 4,
    };
    const committed = {
      target_path: "assets/props/umbrella/reference.png",
      target_url: "/static/projects/demo/assets/props/umbrella/reference.png",
      backup: null,
      stale_marked: 1,
      affected_count: 2,
    };
    uploadProjectAsset.mockResolvedValueOnce(uploaded);
    commitProjectAsset.mockResolvedValueOnce(committed);

    await expect(
      httpPropGateway.uploadReference("demo project", "umbrella", file),
    ).resolves.toEqual({ ok: true, data: committed });
    expect(uploadProjectAsset).toHaveBeenCalledWith({
      projectId: "demo project",
      file,
      filename: "reference.png",
    });
    expect(post).not.toHaveBeenCalled();
    expect(commitProjectAsset).toHaveBeenCalledWith({
      projectId: "demo project",
      sourceUrl: uploaded.url,
      target: { kind: "prop_ref", prop_id: "umbrella" },
      markStale: true,
    });
  });
});
