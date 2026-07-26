// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const { commitFreezoneAsset, post } = vi.hoisted(() => ({
  commitFreezoneAsset: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/features/freezone/public", () => ({ commitFreezoneAsset }));
vi.mock("@/shared/api/transport", () => ({ api: { post } }));

import { httpPropGateway } from "@/modules/asset_world/infrastructure/http-prop-gateway";

describe("HTTP prop gateway", () => {
  beforeEach(() => {
    commitFreezoneAsset.mockReset();
    post.mockReset();
  });

  it("uploads a reference source and delegates its canonical commit to Freezone", async () => {
    const file = new File(["prop"], "reference.png", { type: "image/png" });
    const uploaded = {
      ok: true,
      data: {
        url: "/static/projects/demo/freezone/uploads/reference.png",
        filename: "reference.png",
        size: 4,
      },
    };
    const committed = {
      target_path: "assets/props/umbrella/reference.png",
      target_url: "/static/projects/demo/assets/props/umbrella/reference.png",
      backup: null,
      stale_marked: 1,
      affected_count: 2,
    };
    const json = vi.fn().mockResolvedValue(uploaded);
    post.mockReturnValueOnce({ json });
    commitFreezoneAsset.mockResolvedValueOnce(committed);

    await expect(
      httpPropGateway.uploadReference("demo project", "umbrella", file),
    ).resolves.toEqual({ ok: true, data: committed });
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith(
      "api/v1/projects/demo%20project/freezone/upload",
      { body: expect.any(FormData) },
    );
    const formData = post.mock.calls[0]?.[1]?.body as FormData;
    expect(formData.get("file")).toBe(file);
    expect(commitFreezoneAsset).toHaveBeenCalledWith(
      "demo project",
      uploaded.data.url,
      { kind: "prop_ref", prop_id: "umbrella" },
      { mark_stale: true },
    );
  });
});
