// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasAssetGateway } from "./ports";
import { uploadCanvasAsset } from "./uploadCanvasAsset";

describe("uploadCanvasAsset", () => {
  it("uploads an asset and returns its stable URL", async () => {
    const gateway: CanvasAssetGateway = {
      upload: vi.fn().mockResolvedValue({
        url: "/static/upload.png",
        filename: "upload.png",
        size: 5,
      }),
    };
    const file = new File(["image"], "source.png", { type: "image/png" });

    await expect(
      uploadCanvasAsset(
        {
          projectId: "project-1",
          file,
          filename: "target.png",
        },
        gateway,
      ),
    ).resolves.toEqual({
      url: "/static/upload.png",
      filename: "upload.png",
      size: 5,
    });
    expect(gateway.upload).toHaveBeenCalledWith(
      "project-1",
      file,
      "target.png",
      undefined,
    );
  });

  it("preserves the disabled-timeout policy used for large assets", async () => {
    const gateway: CanvasAssetGateway = {
      upload: vi.fn().mockResolvedValue({
        url: "/static/upload.mp4",
        filename: "upload.mp4",
        size: 5,
      }),
    };
    const file = new File(["video"], "source.mp4", { type: "video/mp4" });

    await uploadCanvasAsset(
      {
        projectId: "project-1",
        file,
        filename: "target.mp4",
        options: { disableTimeout: true },
      },
      gateway,
    );
    expect(gateway.upload).toHaveBeenCalledWith(
      "project-1",
      file,
      "target.mp4",
      { disableTimeout: true },
    );
  });
});
