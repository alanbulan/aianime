// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  createCanvasFromPreset,
  createBlankFreezoneCanvas,
  deleteFreezoneCanvas,
  getFreezoneCanvas,
  listFreezoneCanvasHistory,
  listFreezoneCanvases,
  putFreezoneCanvas,
  restoreFreezoneCanvasVersion,
  type FreezoneCanvasStorageGateway,
} from "./freezoneCanvasStorage";

function createGateway(): FreezoneCanvasStorageGateway {
  return {
    listCanvases: vi.fn().mockResolvedValue([]),
    getCanvas: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    saveCanvas: vi.fn().mockResolvedValue({ saved: true, revision: 1 }),
    createFromPreset: vi.fn().mockResolvedValue({
      canvas_id: "default",
      reused: false,
      url: "/freezone/?canvas=default",
    }),
    deleteCanvas: vi.fn().mockResolvedValue({ deleted: true }),
    listHistory: vi.fn().mockResolvedValue([]),
    restoreVersion: vi.fn().mockResolvedValue({ saved: true, revision: 2 }),
  };
}

describe("freezoneCanvasStorage", () => {
  it("delegates canvas reads through the storage port", async () => {
    const gateway = createGateway();
    const params = {
      projectId: "project-a",
      canvasId: "user_eric",
      signal: new AbortController().signal,
    };

    await getFreezoneCanvas(params, gateway);

    expect(gateway.getCanvas).toHaveBeenCalledWith(params);
  });

  it("builds a named blank canvas before saving it", async () => {
    const gateway = createGateway();

    await createBlankFreezoneCanvas(
      "project-a",
      {
        canvasId: "story-lab",
        name: "Story Lab",
        creatorUsername: "alice",
      },
      gateway,
      { next: () => "save-1" },
    );

    expect(gateway.saveCanvas).toHaveBeenCalledWith({
      projectId: "project-a",
      canvasId: "story-lab",
      payload: {
        schema_version: 2,
        canvas_id: "story-lab",
        project_id: "project-a",
        base_revision: null,
        client_save_id: "save-1",
        save_source: "manual_save",
        nodes: [],
        edges: [],
        viewport: null,
        metadata: {
          canvas_origin: "user_created",
          display_name: "Story Lab",
          creator_username: "alice",
        },
      },
    });
  });

  it("delegates preset restoration through the storage port", async () => {
    const gateway = createGateway();
    const params = {
      projectId: "project-a",
      payload: {
        scope: "beat" as const,
        episode: 1,
        beat: 4,
        canvas_id: "user_eric",
        overwrite_existing: true,
      },
    };

    await createCanvasFromPreset(params, gateway);

    expect(gateway.createFromPreset).toHaveBeenCalledWith(params);
  });

  it("delegates list, save, delete and history operations", async () => {
    const gateway = createGateway();
    const target = { projectId: "project-a", canvasId: "story-lab" };
    const payload = { nodes: [], edges: [] };

    await listFreezoneCanvases({ projectId: "project-a" }, gateway);
    await putFreezoneCanvas({ ...target, payload }, gateway);
    await deleteFreezoneCanvas(target, gateway);
    await listFreezoneCanvasHistory(target, gateway);
    await restoreFreezoneCanvasVersion(
      { ...target, payload: { history_id: "rev-2" } },
      gateway,
    );

    expect(gateway.listCanvases).toHaveBeenCalledWith({
      projectId: "project-a",
    });
    expect(gateway.saveCanvas).toHaveBeenCalledWith({ ...target, payload });
    expect(gateway.deleteCanvas).toHaveBeenCalledWith(target);
    expect(gateway.listHistory).toHaveBeenCalledWith(target);
    expect(gateway.restoreVersion).toHaveBeenCalledWith({
      ...target,
      payload: { history_id: "rev-2" },
    });
  });
});
