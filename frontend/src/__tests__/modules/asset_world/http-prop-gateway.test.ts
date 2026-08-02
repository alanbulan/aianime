// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const { commitFreezoneAsset, post, uploadFreezoneAsset } = vi.hoisted(() => ({
  commitFreezoneAsset: vi.fn(),
  post: vi.fn(),
  uploadFreezoneAsset: vi.fn(),
}));

vi.mock("@/modules/creative_canvas/public", () => ({
  commitFreezoneAsset,
  uploadFreezoneAsset,
}));
vi.mock("@/shared/api/transport", () => ({ api: { post } }));

import { httpPropGateway } from "@/modules/asset_world/infrastructure/http-prop-gateway";

describe("HTTP prop gateway", () => {
  beforeEach(() => {
    commitFreezoneAsset.mockReset();
    post.mockReset();
    uploadFreezoneAsset.mockReset();
  });

  it("uploads a reference source and delegates its canonical commit to Freezone", async () => {
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
    uploadFreezoneAsset.mockResolvedValueOnce(uploaded);
    commitFreezoneAsset.mockResolvedValueOnce(committed);

    await expect(
      httpPropGateway.uploadReference("demo project", "umbrella", file),
    ).resolves.toEqual({ ok: true, data: committed });
    expect(uploadFreezoneAsset).toHaveBeenCalledWith(
      "demo project",
      file,
      "reference.png",
    );
    expect(post).not.toHaveBeenCalled();
    expect(commitFreezoneAsset).toHaveBeenCalledWith(
      "demo project",
      uploaded.url,
      { kind: "prop_ref", prop_id: "umbrella" },
      { mark_stale: true },
    );
  });
});
