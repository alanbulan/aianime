// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_DRAFT_MAX_BYTES,
  canvasDraftStorageGateway,
  canvasDraftSignature,
} from "@/modules/creative_canvas/public";
import { CANVAS_NODE_TYPES } from "@/features/canvas/domain/canvasNodes";
import { safeLocalStorageSet } from "@/lib/localStorageQuota";
import {
  FREEZONE_CANVAS_TTL_MS,
  installFreezoneCanvasStorageReclaimer,
  scheduleCanvasDraftPruneOnce,
} from "@/modules/creative_canvas/public";
import * as storageReclaimer from "@/modules/creative_canvas/infrastructure/browserCanvasStorageReclaimer";

const {
  readDraft: readCanvasDraft,
  writeDraft: writeCanvasDraft,
} = canvasDraftStorageGateway;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("canvas draft prune scheduling", () => {
  it("schedules one idle prune for the page lifetime", () => {
    const scheduled: { run: (() => void) | null } = { run: null };
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      scheduled.run = () =>
        callback({
          didTimeout: false,
          timeRemaining: () => 50,
        });
      return 1;
    });
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    const prune = vi.spyOn(storageReclaimer, "pruneFreezoneCanvasStorage");

    scheduleCanvasDraftPruneOnce();
    scheduleCanvasDraftPruneOnce();

    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 2_000,
    });
    scheduled.run?.();
    expect(prune).toHaveBeenCalledTimes(1);
  });
});

describe("canvas draft storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("drops history before giving up on the recoverable canvas content", () => {
    const contentPadding = "x".repeat(Math.floor(CANVAS_DRAFT_MAX_BYTES / 3));
    const historyPadding = "y".repeat(CANVAS_DRAFT_MAX_BYTES);
    const ok = writeCanvasDraft("project-a", "draft-heavy", {
      baseRevision: 3,
      nodes: [
        {
          id: "draft-node",
          type: CANVAS_NODE_TYPES.upload,
          position: { x: 0, y: 0 },
          data: { label: contentPadding },
        },
      ],
      edges: [],
      viewport: null,
      metadata: null,
      history: {
        past: [
          {
            nodes: [
              {
                id: "history-node",
                type: CANVAS_NODE_TYPES.upload,
                position: { x: 0, y: 0 },
                data: { label: historyPadding },
              },
            ],
            edges: [],
          },
        ],
        future: [],
      },
      mutation: {
        userEditsSinceHydrate: 1,
        lastMutationSource: "user_edit",
        pendingClearIntent: false,
      },
      updatedAt: 1_000,
    });

    expect(ok).toBe(true);
    const draft = readCanvasDraft("project-a", "draft-heavy");
    expect(draft?.nodes).toHaveLength(1);
    expect(draft?.history).toBeNull();
  });

  it("does not persist a fake draft when the core content itself is too large", () => {
    const ok = writeCanvasDraft("project-a", "draft-too-large", {
      baseRevision: 3,
      nodes: [
        {
          id: "draft-node",
          type: CANVAS_NODE_TYPES.upload,
          position: { x: 0, y: 0 },
          data: { label: "x".repeat(CANVAS_DRAFT_MAX_BYTES + 1) },
        },
      ],
      edges: [],
      viewport: null,
      metadata: null,
      history: { past: [], future: [] },
      mutation: {
        userEditsSinceHydrate: 1,
        lastMutationSource: "user_edit",
        pendingClearIntent: false,
      },
      updatedAt: 1_000,
    });

    expect(ok).toBe(false);
    expect(readCanvasDraft("project-a", "draft-too-large")).toBeNull();
  });

  it("keeps metadata signatures stable across object key order", () => {
    expect(
      canvasDraftSignature([], [], {
        shotMetadata: { b: 2, a: 1 },
      }),
    ).toBe(
      canvasDraftSignature([], [], {
        shotMetadata: { a: 1, b: 2 },
      }),
    );
  });

  it("scopes drafts by project and canvas id", () => {
    writeCanvasDraft("project-a", "canvas-a", {
      baseRevision: 1,
      nodes: [],
      edges: [],
      viewport: null,
      metadata: null,
      history: null,
      mutation: {
        userEditsSinceHydrate: 1,
        lastMutationSource: "user_edit",
        pendingClearIntent: false,
      },
      updatedAt: 10,
    });

    expect(readCanvasDraft("project-a", "canvas-a")).not.toBeNull();
    expect(readCanvasDraft("project-a", "canvas-b")).toBeNull();
    expect(readCanvasDraft("project-b", "canvas-a")).toBeNull();
  });

  it("ignores malformed draft JSON", () => {
    window.localStorage.setItem(
      "ai-anime-freezone:canvas-draft:project-a:broken",
      "{not json",
    );

    expect(readCanvasDraft("project-a", "broken")).toBeNull();
  });

  it("prunes expired draft entries without removing fresh drafts", () => {
    writeCanvasDraft("project-a", "old", {
      baseRevision: 1,
      nodes: [],
      edges: [],
      viewport: null,
      metadata: null,
      history: null,
      mutation: {
        userEditsSinceHydrate: 1,
        lastMutationSource: "user_edit",
        pendingClearIntent: false,
      },
      updatedAt: 1,
    });
    writeCanvasDraft("project-a", "fresh", {
      baseRevision: 1,
      nodes: [],
      edges: [],
      viewport: null,
      metadata: null,
      history: null,
      mutation: {
        userEditsSinceHydrate: 1,
        lastMutationSource: "user_edit",
        pendingClearIntent: false,
      },
      updatedAt: 7 * 24 * 60 * 60 * 1_000,
    });

    storageReclaimer.pruneFreezoneCanvasStorage(
      8 * 24 * 60 * 60 * 1_000 + 2,
    );

    expect(readCanvasDraft("project-a", "old")).toBeNull();
    expect(readCanvasDraft("project-a", "fresh")).not.toBeNull();
  });
});

describe("pruneFreezoneCanvasStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("prunes stale undo-history mirrors but keeps fresh ones", () => {
    const now = 10 * FREEZONE_CANVAS_TTL_MS;
    window.localStorage.setItem(
      "freezone:canvas-history:project-a:stale",
      JSON.stringify({
        signature: "sig",
        past: [],
        future: [],
        updatedAt: now - FREEZONE_CANVAS_TTL_MS - 1,
      }),
    );
    window.localStorage.setItem(
      "freezone:canvas-history:project-a:fresh",
      JSON.stringify({ signature: "sig", past: [], future: [], updatedAt: now - 1 }),
    );

    storageReclaimer.pruneFreezoneCanvasStorage(now);

    expect(
      window.localStorage.getItem("freezone:canvas-history:project-a:stale"),
    ).toBeNull();
    expect(
      window.localStorage.getItem("freezone:canvas-history:project-a:fresh"),
    ).not.toBeNull();
  });

  it("reclaims a history mirror that has no timestamp (legacy schema)", () => {
    window.localStorage.setItem(
      "freezone:canvas-history:project-a:legacy",
      JSON.stringify({ signature: "sig", past: [], future: [] }),
    );

    storageReclaimer.pruneFreezoneCanvasStorage(FREEZONE_CANVAS_TTL_MS);

    expect(
      window.localStorage.getItem("freezone:canvas-history:project-a:legacy"),
    ).toBeNull();
  });

  it("reclaims a history mirror with a future timestamp (clock skew)", () => {
    const now = 10 * FREEZONE_CANVAS_TTL_MS;
    window.localStorage.setItem(
      "freezone:canvas-history:project-a:future",
      JSON.stringify({ signature: "sig", past: [], future: [], updatedAt: now + 1_000 }),
    );

    storageReclaimer.pruneFreezoneCanvasStorage(now);

    expect(
      window.localStorage.getItem("freezone:canvas-history:project-a:future"),
    ).toBeNull();
  });

  it("prunes stale conflict snapshots by their ISO timestamp", () => {
    const now = 10 * FREEZONE_CANVAS_TTL_MS;
    window.localStorage.setItem(
      "freezone:conflict:stale",
      JSON.stringify({
        canvas_id: "stale",
        nodes: [],
        edges: [],
        timestamp: new Date(now - FREEZONE_CANVAS_TTL_MS - 1).toISOString(),
      }),
    );
    window.localStorage.setItem(
      "freezone:conflict:fresh",
      JSON.stringify({
        canvas_id: "fresh",
        nodes: [],
        edges: [],
        timestamp: new Date(now - 1).toISOString(),
      }),
    );

    storageReclaimer.pruneFreezoneCanvasStorage(now);

    expect(window.localStorage.getItem("freezone:conflict:stale")).toBeNull();
    expect(window.localStorage.getItem("freezone:conflict:fresh")).not.toBeNull();
  });

  it("keeps viewport blobs (no timestamp) but drops malformed ones", () => {
    window.localStorage.setItem(
      "freezone:canvas-viewport:project-a:ok",
      JSON.stringify({ x: 1, y: 2, zoom: 1 }),
    );
    window.localStorage.setItem(
      "freezone:canvas-viewport:project-a:broken",
      "{not json",
    );

    storageReclaimer.pruneFreezoneCanvasStorage(10 * FREEZONE_CANVAS_TTL_MS);

    expect(
      window.localStorage.getItem("freezone:canvas-viewport:project-a:ok"),
    ).not.toBeNull();
    expect(
      window.localStorage.getItem("freezone:canvas-viewport:project-a:broken"),
    ).toBeNull();
  });

  it("leaves unrelated keys untouched", () => {
    window.localStorage.setItem("settings-storage", "keep-me");
    storageReclaimer.pruneFreezoneCanvasStorage(10 * FREEZONE_CANVAS_TTL_MS);
    expect(window.localStorage.getItem("settings-storage")).toBe("keep-me");
  });

  it("reclaims stale canvas data after explicit installation", () => {
    const staleKey = "freezone:canvas-history:project-a:stale";
    window.localStorage.setItem(
      staleKey,
      JSON.stringify({ signature: "sig", past: [], future: [], updatedAt: 1 }),
    );
    const unregister = installFreezoneCanvasStorageReclaimer();
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    try {
      expect(safeLocalStorageSet("settings-storage", "payload")).toBe(true);
      expect(window.localStorage.getItem(staleKey)).toBeNull();
      expect(window.localStorage.getItem("settings-storage")).toBe("payload");
    } finally {
      unregister();
    }
  });
});
