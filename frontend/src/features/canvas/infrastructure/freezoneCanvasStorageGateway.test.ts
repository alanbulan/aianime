// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import { freezoneCanvasStorageGateway } from "./freezoneCanvasStorageGateway";

vi.mock("@/shared/api/client", () => ({
  apiCall: vi.fn(),
}));

describe("freezoneCanvasStorageGateway", () => {
  beforeEach(() => {
    vi.mocked(apiCall).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists canvases and forwards cancellation", async () => {
    const controller = new AbortController();
    vi.mocked(apiCall).mockResolvedValueOnce([]);

    await freezoneCanvasStorageGateway.listCanvases({
      projectId: "project/a",
      signal: controller.signal,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fa/freezone/canvases",
      { signal: controller.signal },
    );
  });

  it("reads an encoded canvas path and forwards cancellation", async () => {
    const controller = new AbortController();
    vi.mocked(apiCall).mockResolvedValueOnce({ nodes: [], edges: [] });

    await freezoneCanvasStorageGateway.getCanvas({
      projectId: "project/a",
      canvasId: "user eric",
      signal: controller.signal,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fa/freezone/canvases/user%20eric",
      { signal: controller.signal },
    );
  });

  it("posts the preset payload through the canonical endpoint", async () => {
    const payload = {
      scope: "beat" as const,
      episode: 1,
      beat: 4,
      canvas_id: "default",
      overwrite_existing: true,
    };
    vi.mocked(apiCall).mockResolvedValueOnce({
      canvas_id: "default",
      reused: false,
      url: "/freezone/?canvas=default",
    });

    await freezoneCanvasStorageGateway.createFromPreset({
      projectId: "project-a",
      payload,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-a/freezone/canvases:from-preset",
      { method: "POST", json: payload },
    );
  });

  it("persists canvas changes with a PUT request body", async () => {
    const payload = {
      nodes: [{ id: "n1" }],
      edges: [],
      base_revision: 7,
      client_save_id: "save-1",
    };
    vi.mocked(apiCall).mockResolvedValueOnce({ saved: true, revision: 8 });

    await freezoneCanvasStorageGateway.saveCanvas({
      projectId: "project-a",
      canvasId: "user_eric",
      payload,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-a/freezone/canvases/user_eric",
      { method: "PUT", json: payload },
    );
  });

  it("sends unload saves through the encoded keepalive endpoint", () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      nodes: [{ id: "n1" }],
      edges: [],
      base_revision: 7,
      client_save_id: "save-1",
    };

    freezoneCanvasStorageGateway.saveCanvasKeepalive({
      projectId: "project/a",
      canvasId: "user eric",
      payload,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/project%2Fa/freezone/canvases/user%20eric",
      {
        method: "PUT",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  });

  it("owns canvas deletion and history transport", async () => {
    vi.mocked(apiCall)
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ saved: true, revision: 9 });

    await freezoneCanvasStorageGateway.deleteCanvas({
      projectId: "project-a",
      canvasId: "story-lab",
    });
    await freezoneCanvasStorageGateway.listHistory({
      projectId: "project-a",
      canvasId: "story-lab",
    });
    await freezoneCanvasStorageGateway.restoreVersion({
      projectId: "project-a",
      canvasId: "story-lab",
      payload: { history_id: "rev-8", base_revision: 8 },
    });

    expect(vi.mocked(apiCall).mock.calls).toEqual([
      [
        "projects/project-a/freezone/canvases/story-lab",
        { method: "DELETE" },
      ],
      ["projects/project-a/freezone/canvases/story-lab/history"],
      [
        "projects/project-a/freezone/canvases/story-lab/restore",
        {
          method: "POST",
          json: { history_id: "rev-8", base_revision: 8 },
        },
      ],
    ]);
  });
});
