// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import { uploadDirectorCaptureBundle } from "./directorCaptureBundle";

describe("uploadDirectorCaptureBundle", () => {
  it("uploads combined, environment, and metadata files into one stable bundle", async () => {
    const uploadAsset = vi.fn(
      async (
        _projectId: string,
        _blob: Blob,
        filename: string,
        _options: { disableTimeout: boolean },
      ) => ({ filename, url: `/assets/${filename}` }),
    );
    const captureBundle = {
      combined: new Blob(["combined"]),
      env_only: new Blob(["environment"]),
      frame_meta: {
        source: { source_id: "source-a", source_kind: "custom" },
      },
    };

    const result = await uploadDirectorCaptureBundle(
      "project-a",
      "world-a",
      captureBundle,
      uploadAsset,
      () => 42,
    );

    expect(uploadAsset).toHaveBeenCalledTimes(3);
    expect(uploadAsset.mock.calls.map((call) => call[2])).toEqual([
      "director-world-world-a-combined-42.png",
      "director-world-world-a-env-only-42.png",
      "director-world-world-a-frame-meta-42.json",
    ]);
    expect(result).toMatchObject({
      schema_version: "director_control_bundle_v1",
      dir: "freezone/director-world",
      urls: {
        combined: "/assets/director-world-world-a-combined-42.png",
        env_only: "/assets/director-world-world-a-env-only-42.png",
        frame_meta: "/assets/director-world-world-a-frame-meta-42.json",
      },
      source: captureBundle.frame_meta.source,
    });
  });
});
