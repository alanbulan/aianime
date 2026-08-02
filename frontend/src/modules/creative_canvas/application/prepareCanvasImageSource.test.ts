// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { FreezoneAssetUploadGateway } from "./assetUpload";
import {
  prepareCanvasImageSource,
  prepareCanvasImageSources,
} from "./prepareCanvasImageSource";

function dependencies(upload = vi.fn()) {
  return {
    upload,
    value: {
      uploadGateway: { upload } satisfies FreezoneAssetUploadGateway,
      now: () => 42,
    },
  };
}

describe("Canvas image source preparation", () => {
  it("strips transient query parameters without uploading remote sources", async () => {
    const deps = dependencies();

    await expect(
      prepareCanvasImageSource(
        { projectId: "project-1", rawUrl: "/static/source.png?v=1" },
        deps.value,
      ),
    ).resolves.toBe("/static/source.png");
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("uploads data URLs through the platform asset gateway", async () => {
    const deps = dependencies(
      vi.fn().mockResolvedValue({
        url: "/static/upload.png?v=2",
        filename: "upload.png",
        size: 1,
      }),
    );

    await expect(
      prepareCanvasImageSource(
        { projectId: "project-1", rawUrl: "data:image/webp;base64,eA==" },
        deps.value,
      ),
    ).resolves.toBe("/static/upload.png");
    expect(deps.upload).toHaveBeenCalledWith({
      projectId: "project-1",
      file: expect.any(Blob),
      filename: "paste-42.webp",
    });
  });

  it("filters blank batch entries and preserves source order", async () => {
    const deps = dependencies();

    await expect(
      prepareCanvasImageSources(
        {
          projectId: "project-1",
          rawUrls: ["", "  ", "/a.png?v=1", "/b.png"],
        },
        deps.value,
      ),
    ).resolves.toEqual(["/a.png", "/b.png"]);
  });
});
