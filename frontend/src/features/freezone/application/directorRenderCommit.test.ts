// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  commitDirectorRenderFromCanvasSource,
  type DirectorRenderCommitGateway,
} from "./directorRenderCommit";

function createGateway(): DirectorRenderCommitGateway {
  return {
    loadJsonRecord: vi.fn().mockResolvedValue({
      schema_version: "director_frame_meta_v1",
      camera: { frame_aspect: "16:9" },
    }),
    loadPngDataUrl: vi.fn().mockImplementation(
      async (url: string) => `data:image/png;base64,${url}`,
    ),
    saveControlFrame: vi.fn().mockResolvedValue({
      combinedPath: "director_control_frames/ep001/beat_06/combined.png",
      combinedUrl: "/static/director_control_frames/ep001/beat_06/combined.png",
    }),
  };
}

describe("directorRenderCommit", () => {
  it("builds a manual control-frame payload through the application port", async () => {
    const gateway = createGateway();

    await expect(commitDirectorRenderFromCanvasSource({
      projectId: "project-a",
      target: { kind: "director_render", episode: 1, beat: 6 },
      source: {
        sourceUrl: "/static/freezone/edit.png",
        sourceNodeId: "node-1",
        label: "改过的图",
      },
    }, gateway)).resolves.toEqual({
      target_path: "director_control_frames/ep001/beat_06/combined.png",
      target_url: "/static/director_control_frames/ep001/beat_06/combined.png",
      backup: null,
    });

    expect(gateway.loadJsonRecord).not.toHaveBeenCalled();
    expect(gateway.loadPngDataUrl).toHaveBeenCalledOnce();
    expect(gateway.loadPngDataUrl).toHaveBeenCalledWith(
      "/static/freezone/edit.png",
    );
    expect(gateway.saveControlFrame).toHaveBeenCalledWith({
      projectId: "project-a",
      episode: 1,
      beat: 6,
      payload: expect.objectContaining({
        frame_aspect: "16:9",
        frame_meta: expect.objectContaining({
          schema_version: "director_frame_meta_v1",
          source: expect.objectContaining({
            source_id: "manual_canvas_commit:node-1",
            label: "改过的图",
          }),
        }),
        images: {
          combined: "data:image/png;base64,/static/freezone/edit.png",
          env_only: "data:image/png;base64,/static/freezone/edit.png",
        },
      }),
    });
  });

  it("loads complete bundle parts and preserves the bundle relative path fallback", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.loadJsonRecord).mockResolvedValueOnce({
      schema_version: "director_frame_meta_v1",
      camera: { frame_aspect: "4:3" },
    });
    vi.mocked(gateway.saveControlFrame).mockResolvedValueOnce({
      combinedPath: "",
      combinedUrl: "/static/canonical-combined.png",
    });

    const result = await commitDirectorRenderFromCanvasSource({
      projectId: "project-a",
      target: { kind: "director_render", episode: 2, beat: 3 },
      source: {
        sourceUrl: "/static/ignored.png",
        bundle: {
          rel_paths: { combined: "bundle/combined.png" },
          urls: {
            combined: "/static/bundle/combined.png",
            env_only: "/static/bundle/env-only.png",
            frame_meta: "/static/bundle/frame-meta.json",
          },
          source: { source_id: "bundle-source" },
        },
      },
    }, gateway);

    expect(result.target_path).toBe("bundle/combined.png");
    expect(gateway.loadJsonRecord).toHaveBeenCalledWith(
      "/static/bundle/frame-meta.json",
    );
    expect(gateway.loadPngDataUrl).toHaveBeenNthCalledWith(
      1,
      "/static/bundle/combined.png",
    );
    expect(gateway.loadPngDataUrl).toHaveBeenNthCalledWith(
      2,
      "/static/bundle/env-only.png",
    );
    expect(gateway.saveControlFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          frame_aspect: "4:3",
          source: { source_id: "bundle-source" },
        }),
      }),
    );
  });

  it("rejects control-frame saves without a complete canonical result", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.saveControlFrame).mockResolvedValueOnce({
      combinedPath: "bundle/combined.png",
      combinedUrl: "",
    });

    await expect(commitDirectorRenderFromCanvasSource({
      projectId: "project-a",
      target: { kind: "director_render", episode: 1, beat: 6 },
      source: { sourceUrl: "/static/freezone/edit.png" },
    }, gateway)).rejects.toThrow("导演合成图写入后缺少目标路径");
  });
});
