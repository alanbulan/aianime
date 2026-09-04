// Copyright (c) 2026 AI anime
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useMemo, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimOwnership,
  isActiveStatus,
  releaseOwnership,
  serializeKey,
  TaskControllerProvider,
  useTaskRegistry,
  type TaskControllerSnapshot,
  type TaskKey,
  type TaskRegistryEntry,
} from "@/modules/task_execution/presentation/task-controller-provider";
import { useTaskController } from "@/modules/task_execution/presentation/useTaskController";
import { selectionScope } from "@/modules/task_execution/domain/taskScope";
import { queryKeys } from "@/lib/query-keys";

// ─── Module mocks ───────────────────────────────────────────────────────────
//
// `useTaskController` pulls in three external dependencies that would otherwise
// try to touch the network / open EventSources during render. We mock them so
// the integration tests exercise only the scoped-controller machinery.

const useTaskStreamMock = vi.fn(
  (_opts: { enabled?: boolean; taskType: string }) => ({
    status: "idle" as const,
    progress: 0,
    currentTask: "",
    result: null,
    error: null,
    logs: [],
  }),
);
const taskQueryMockState = vi.hoisted(() => ({
  data: undefined as { data: Array<Record<string, unknown>> } | undefined,
}));

vi.mock("@/modules/task_execution/presentation/useTaskStream", () => ({
  useTaskStream: (opts: { enabled?: boolean; taskType: string }) =>
    useTaskStreamMock(opts),
}));

vi.mock("@/modules/task_execution/composition", () => ({
  useTasks: () => ({ data: taskQueryMockState.data }),
  useCancelTask: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ ok: true, data: null }),
    isPending: false,
  }),
}));

// ─── serializeKey: pure key-dedup logic ────────────────────────────────────
//
// Two TaskKey objects identify the same scoped task iff their serialized
// form is equal. This is the contract the registry map relies on to dedupe
// subscribers and guarantee one SSE stream per key.

describe("serializeKey", () => {
  const base: TaskKey = {
    taskType: "sketch_generation",
    project: "demo",
    episode: 1,
  };

  it("produces deterministic strings for identical keys", () => {
    expect(serializeKey(base)).toBe(serializeKey({ ...base }));
  });

  it("includes taskType, project, episode in the output", () => {
    const s = serializeKey(base);
    expect(s).toContain("sketch_generation");
    expect(s).toContain("demo");
    expect(s).toContain("1");
  });

  it("distinguishes different taskTypes", () => {
    const other: TaskKey = { ...base, taskType: "audio_generation" };
    expect(serializeKey(base)).not.toBe(serializeKey(other));
  });

  it("distinguishes different projects", () => {
    const other: TaskKey = { ...base, project: "other" };
    expect(serializeKey(base)).not.toBe(serializeKey(other));
  });

  it("distinguishes different episodes", () => {
    const other: TaskKey = { ...base, episode: 2 };
    expect(serializeKey(base)).not.toBe(serializeKey(other));
  });

  it("distinguishes different beat numbers", () => {
    const a: TaskKey = { ...base, beatNum: 1 };
    const b: TaskKey = { ...base, beatNum: 2 };
    expect(serializeKey(a)).not.toBe(serializeKey(b));
  });

  it("distinguishes different scopes", () => {
    const a: TaskKey = { ...base, scope: "single" };
    const b: TaskKey = { ...base, scope: "batch" };
    expect(serializeKey(a)).not.toBe(serializeKey(b));
  });

  it("treats undefined beatNum and scope as empty, not missing", () => {
    // Absent optional field ≡ empty string segment, so a key with no beatNum
    // still collides with another no-beatNum key for the same stage.
    const noScope1: TaskKey = { ...base };
    const noScope2: TaskKey = { ...base, beatNum: undefined };
    expect(serializeKey(noScope1)).toBe(serializeKey(noScope2));
  });

  it("distinguishes beatNum=0 from absent beatNum", () => {
    // beatNum=0 is a valid scope (global/episode-level) used by the plan
    // episodes task. It should NOT collide with absent beatNum.
    const absent: TaskKey = { ...base };
    const zero: TaskKey = { ...base, beatNum: 0 };
    // Both render "" for absent and "0" for zero → distinct.
    expect(serializeKey(absent)).not.toBe(serializeKey(zero));
  });
});

// ─── isActiveStatus ────────────────────────────────────────────────────────

describe("isActiveStatus", () => {
  it("returns true for pending / starting / running", () => {
    expect(isActiveStatus("pending")).toBe(true);
    expect(isActiveStatus("starting")).toBe(true);
    expect(isActiveStatus("running")).toBe(true);
  });

  it("returns false for completed / failed", () => {
    expect(isActiveStatus("completed")).toBe(false);
    expect(isActiveStatus("failed")).toBe(false);
  });
});

// ─── claimOwnership / releaseOwnership: deterministic ownership flow ──────
//
// We test with a hand-rolled minimal entry; the real registry entry is
// created by `createEntry` (not exported) but both functions depend only on
// `ownerInstanceId`, so the stub is sufficient.

function makeStubEntry() {
  return {
    ownerInstanceId: null as string | null,
    subscribers: new Set<string>(),
    key: {} as TaskKey,
    serializedKey: "",
    getSnapshot: () => ({}) as never,
    setSnapshot: () => {},
    subscribe: () => () => {},
  };
}

describe("claimOwnership / releaseOwnership", () => {
  it("first claim succeeds", () => {
    const entry = makeStubEntry();
    expect(claimOwnership(entry, "a")).toBe(true);
    expect(entry.ownerInstanceId).toBe("a");
  });

  it("second claim by a different instance fails", () => {
    const entry = makeStubEntry();
    claimOwnership(entry, "a");
    expect(claimOwnership(entry, "b")).toBe(false);
    expect(entry.ownerInstanceId).toBe("a");
  });

  it("re-claim by same instance is idempotent (safe for strict mode)", () => {
    const entry = makeStubEntry();
    claimOwnership(entry, "a");
    expect(claimOwnership(entry, "a")).toBe(true);
    expect(entry.ownerInstanceId).toBe("a");
  });

  it("releasing a non-owner is a no-op", () => {
    const entry = makeStubEntry();
    claimOwnership(entry, "a");
    releaseOwnership(entry, "b");
    expect(entry.ownerInstanceId).toBe("a");
  });

  it("releasing the owner clears the slot for re-acquisition", () => {
    const entry = makeStubEntry();
    claimOwnership(entry, "a");
    releaseOwnership(entry, "a");
    expect(entry.ownerInstanceId).toBeNull();
    expect(claimOwnership(entry, "b")).toBe(true);
  });
});

// ─── claim/release propagate hasOwner into the snapshot ────────────────────
//
// This is the reactivity contract that makes owner transfer work: observers
// subscribed via `useSyncExternalStore` only know to re-render when the
// snapshot they're reading changes. `claimOwnership` / `releaseOwnership`
// must therefore atomically update `entry.ownerInstanceId` AND emit a new
// snapshot with the matching `hasOwner` boolean.

describe("ownership transitions emit snapshot updates", () => {
  function makeRealEntry(): TaskRegistryEntry {
    // Replicate the shape of `createEntry` — we can't import it because it's
    // intentionally unexported, but emulating it here gives us a listener
    // channel so we can observe emits.
    const listeners = new Set<() => void>();
    let snap: TaskControllerSnapshot = {
      started: false,
      activeTaskType: "t",
      activeTaskId: null,
      runVersion: 0,
      activeScope: null,
      streamState: {
        status: "idle",
        progress: 0,
        currentTask: "",
        result: null,
        error: null,
        logs: [],
      },
      hasOwner: false,
    };
    return {
      key: {} as TaskKey,
      serializedKey: "k",
      ownerInstanceId: null,
      subscribers: new Set(),
      getSnapshot: () => snap,
      setSnapshot(next) {
        snap = next;
        for (const l of listeners) l();
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }

  it("flips hasOwner to true on successful claim and emits", () => {
    const entry = makeRealEntry();
    const listener = vi.fn();
    entry.subscribe(listener);
    expect(entry.getSnapshot().hasOwner).toBe(false);
    expect(claimOwnership(entry, "a")).toBe(true);
    expect(entry.getSnapshot().hasOwner).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not re-emit on idempotent re-claim by the owner", () => {
    const entry = makeRealEntry();
    claimOwnership(entry, "a");
    const listener = vi.fn();
    entry.subscribe(listener);
    claimOwnership(entry, "a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("flips hasOwner to false on release and emits", () => {
    const entry = makeRealEntry();
    claimOwnership(entry, "a");
    const listener = vi.fn();
    entry.subscribe(listener);
    releaseOwnership(entry, "a");
    expect(entry.getSnapshot().hasOwner).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not emit when a non-owner tries to release", () => {
    const entry = makeRealEntry();
    claimOwnership(entry, "a");
    const listener = vi.fn();
    entry.subscribe(listener);
    releaseOwnership(entry, "b");
    expect(listener).not.toHaveBeenCalled();
    expect(entry.getSnapshot().hasOwner).toBe(true);
  });
});

// ─── Integration tests: provider + useTaskController ───────────────────────
//
// These tests exercise the real React tree (Happy DOM + React Testing Library)
// and guard the two architectural invariants of Slice 5a:
//
//   (C1) Exactly one registry entry per serialized TaskKey, even under
//        StrictMode's simulated unmount/remount cycle.
//   (C2) When the current owner unmounts while another subscriber is still
//        mounted, the remaining subscriber gets promoted to owner so the
//        SSE stream continues.
//
// Strategy: mount consumers using `useTaskController`, expose the registry
// entry they bind to via ref callbacks, and then assert against the
// provider's own `getOrCreate` to prove the fiber-visible entry is the
// canonical map entry.

const KEY: TaskKey = {
  taskType: "sketch_generation",
  project: "demo",
  episode: 1,
};

interface ExposedHandle {
  entry: TaskRegistryEntry;
  instanceId: string | null;
}

/**
 * Test consumer that binds `useTaskController` to `KEY` and exposes the
 * registry entry it memoized + the owner id it sees after the effect pass.
 * Also re-resolves `getOrCreate` via the registry handle so the test can
 * diff the fiber-held entry against the map-held entry (C1 detection).
 */
function TestConsumer({
  onRender,
}: {
  onRender: (h: ExposedHandle) => void;
}) {
  const registry = useTaskRegistry();
  const entry = useMemo(() => registry.getOrCreate(KEY), [registry]);
  // Drive the full hook so we exercise the real membership + watchdog wiring.
  useTaskController({ key: KEY });
  // Record the fiber's view of the entry + current owner after each render.
  // `onRender` is intentionally called during render — the test only reads
  // the latest entry after `act` settles, so double-invocation under
  // StrictMode is harmless.
  onRender({ entry, instanceId: entry.ownerInstanceId });
  return null;
}

/** Inspector exposes the provider-level `getOrCreate` to the outer test. */
function RegistryInspector({
  onReady,
}: {
  onReady: (get: (key: TaskKey) => TaskRegistryEntry) => void;
}) {
  const registry = useTaskRegistry();
  onReady(registry.getOrCreate);
  return null;
}

function renderWithProvider(
  children: ReactNode,
  strict = true,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const tree = (
    <QueryClientProvider client={client}>
      <TaskControllerProvider>
        {children}
      </TaskControllerProvider>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe("TaskControllerProvider + useTaskController integration", () => {
  beforeEach(() => {
    vi.useRealTimers();
    useTaskStreamMock.mockClear();
    taskQueryMockState.data = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ["sketch_regen", "1x1_2-3_sketch"],
    ["selected_regen", "1x1_2-3"],
  ])("isolates %s beat cards while another batch keeps running", async (taskType, modeKey) => {
    const keyFor = (beatNumber: number): TaskKey => ({
      taskType,
      project: "demo",
      episode: 1,
      scope: selectionScope(modeKey, [beatNumber]),
    });
    const ownTask = {
      task_id: "beat-4-run",
      task_type: taskType,
      episode: 1,
      beat_num: null,
      scope: keyFor(4).scope,
      status: "running",
      progress: 0.2,
    };
    const unrelatedBatch = {
      ...ownTask,
      task_id: "other-beats-run",
      scope: selectionScope(modeKey, [18, 24, 25, 26, 27, 28, 29, 30]),
    };
    taskQueryMockState.data = { data: [unrelatedBatch, ownTask] };
    const handles = new Map<number, ReturnType<typeof useTaskController>>();
    let force: (() => void) | null = null;
    let mapLookup: ((key: TaskKey) => TaskRegistryEntry) | null = null;
    function Probe({ beatNumber }: { beatNumber: number }) {
      handles.set(beatNumber, useTaskController({ key: keyFor(beatNumber) }));
      return null;
    }
    function Host() {
      const [, setTick] = useState(0);
      force = () => setTick((tick) => tick + 1);
      return <><Probe beatNumber={1} /><Probe beatNumber={4} /></>;
    }

    renderWithProvider(
      <>
        <Host />
        <RegistryInspector onReady={(get) => { mapLookup = get; }} />
      </>,
    );

    await waitFor(() => expect(handles.get(4)?.started).toBe(true));
    expect(handles.get(1)?.started).toBe(false);
    expect(mapLookup!(keyFor(4)).getSnapshot().activeTaskId).toBe("beat-4-run");
    expect(mapLookup!(keyFor(1))).not.toBe(mapLookup!(keyFor(4)));

    taskQueryMockState.data = {
      data: [unrelatedBatch, { ...ownTask, status: "completed", progress: 1 }],
    };
    act(() => { force?.(); });

    await waitFor(() => expect(handles.get(4)?.started).toBe(false));
    expect(handles.get(4)?.stream.status).toBe("completed");
    expect(handles.get(1)?.started).toBe(false);
  });

  it("adopts an assistant-started task after the panel controller is already mounted", async () => {
    const key: TaskKey = {
      taskType: "single_video",
      project: "demo",
      episode: 1,
      beatNum: 4,
    };
    taskQueryMockState.data = { data: [] };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    let handle: ReturnType<typeof useTaskController> | null = null;
    let force: (() => void) | null = null;
    let mapLookup: ((candidate: TaskKey) => TaskRegistryEntry) | null = null;

    function Probe() {
      const [, setTick] = useState(0);
      force = () => setTick((tick) => tick + 1);
      handle = useTaskController({
        key,
        invalidateKeys: [queryKeys.beats("demo", 1)],
      });
      return null;
    }

    renderWithProvider(
      <>
        <Probe />
        <RegistryInspector onReady={(get) => { mapLookup = get; }} />
      </>,
      false,
      client,
    );

    expect(handle!.started).toBe(false);

    taskQueryMockState.data = {
      data: [{
        task_id: "assistant-video-run",
        task_type: "single_video",
        episode: 1,
        beat_num: 4,
        scope: null,
        status: "running",
        progress: 0.2,
      }],
    };
    act(() => { force?.(); });

    await waitFor(() => expect(handle!.started).toBe(true));
    expect(mapLookup!(key).getSnapshot().activeTaskId).toBe(
      "assistant-video-run",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.beats("demo", 1),
    });
  });

  it("does not carry the previous beat's active task into the next card", async () => {
    const scope = selectionScope("1x1_2-3_sketch", [4]);
    taskQueryMockState.data = {
      data: [{
        task_id: "beat-4-run",
        task_type: "sketch_regen",
        episode: 1,
        beat_num: null,
        scope,
        status: "running",
        progress: 0.2,
      }],
    };
    let setBeat: ((beatNumber: number) => void) | null = null;
    let handle: ReturnType<typeof useTaskController> | null = null;
    function Probe() {
      const [beatNumber, updateBeat] = useState(4);
      setBeat = updateBeat;
      handle = useTaskController({
        key: {
          taskType: "sketch_regen",
          project: "demo",
          episode: 1,
          scope: selectionScope("1x1_2-3_sketch", [beatNumber]),
        },
      });
      return null;
    }

    renderWithProvider(<Probe />);
    await waitFor(() => expect(handle!.started).toBe(true));
    act(() => { setBeat?.(1); });
    await waitFor(() => expect(handle!.started).toBe(false));
    act(() => { setBeat?.(4); });
    await waitFor(() => expect(handle!.started).toBe(true));
  });

  it("keeps one registry entry per key under StrictMode (C1 regression guard)", () => {
    // Pre-fix: StrictMode's simulated cleanup → `registry.maybeDelete(key)`
    // wipes the entry out of the map while the fiber still holds it via
    // useMemo. The next `getOrCreate(key)` call creates a fresh entry, so
    // `fiberEntry !== mapEntry` — the orphan condition. Post-fix: entries
    // live for the provider's lifetime and the two match.
    const renders: ExposedHandle[] = [];
    let mapLookup: ((k: TaskKey) => TaskRegistryEntry) | null = null;
    renderWithProvider(
      <>
        <TestConsumer onRender={(h) => renders.push(h)} />
        <RegistryInspector
          onReady={(get) => {
            mapLookup = get;
          }}
        />
      </>,
    );
    // Latest render's observed entry is the one the fiber holds.
    const latest = renders[renders.length - 1];
    expect(latest).toBeDefined();
    expect(mapLookup).not.toBeNull();
    // Map lookup for the same key must return the SAME object reference.
    // If the entry had been orphaned by strict-mode cleanup, `getOrCreate`
    // would have minted a new one and this equality would fail.
    expect(mapLookup!(KEY)).toBe(latest.entry);
    // And the fiber's entry is owned (by the single subscriber).
    expect(latest.entry.ownerInstanceId).not.toBeNull();
    // `useTaskStream` is mounted, and at most one of its invocations per
    // consumer ever has `enabled: true` (we only have one consumer here).
    const enabledCalls = useTaskStreamMock.mock.calls.filter(
      ([opts]) => opts.enabled === true,
    );
    // Without calling `start()` the stream never flips enabled; guard against
    // the inverse surprise (if some code path set `started: true` implicitly).
    expect(enabledCalls.length).toBe(0);
  });

  it("two subscribers on the same key share one entry and one stream (C1+C2)", () => {
    // This is the drawer-workbench scenario that Slice 5b will ship. Two
    // `useTaskController` callers with identical keys must resolve to the
    // same registry entry (else duplicate SSE streams).
    const rendersA: ExposedHandle[] = [];
    const rendersB: ExposedHandle[] = [];
    let mapLookup: ((k: TaskKey) => TaskRegistryEntry) | null = null;
    renderWithProvider(
      <>
        <TestConsumer onRender={(h) => rendersA.push(h)} />
        <TestConsumer onRender={(h) => rendersB.push(h)} />
        <RegistryInspector
          onReady={(get) => {
            mapLookup = get;
          }}
        />
      </>,
    );
    const a = rendersA[rendersA.length - 1];
    const b = rendersB[rendersB.length - 1];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(mapLookup).not.toBeNull();
    // Both subscribers resolved to the SAME entry.
    expect(a.entry).toBe(b.entry);
    // And the canonical map entry is that same object.
    expect(mapLookup!(KEY)).toBe(a.entry);
    // Exactly one of them owns — the set of subscribers is two.
    expect(a.entry.ownerInstanceId).not.toBeNull();
    expect(a.entry.subscribers.size).toBe(2);
  });

  it(
    "promotes the remaining subscriber to owner when the current owner unmounts (C2 regression guard)",
    async () => {
      // Pre-fix: `useTaskController`'s claim effect had deps
      // `[entry, instanceId, registry]`. When the owner unmounted, none of
      // those changed for the observer's hook instance, so its effect never
      // re-ran and `isOwner` stayed false. This test unmounts the owner and
      // asserts the observer's `useTaskStream` flips to `enabled: true`.
      const rendersA: ExposedHandle[] = [];
      const rendersB: ExposedHandle[] = [];

      // We need to be able to unmount ConsumerA without remounting B.
      // Use a wrapper that conditionally renders ConsumerA based on a state
      // setter we can flip via `act`.
      let setShowA: ((v: boolean) => void) | null = null;
      function Host() {
        const [showA, _setShowA] = useState(true);
        setShowA = _setShowA;
        return (
          <>
            {showA ? (
              <TestConsumer onRender={(h) => rendersA.push(h)} />
            ) : null}
            <TestConsumer onRender={(h) => rendersB.push(h)} />
          </>
        );
      }

      renderWithProvider(<Host />);

      // Grab the shared entry via ConsumerB (which will survive the unmount).
      const bEntry = rendersB[rendersB.length - 1].entry;
      expect(bEntry.ownerInstanceId).not.toBeNull();
      expect(bEntry.subscribers.size).toBe(2);
      // Remember who the original owner is so we can later assert transfer.
      const originalOwnerId = bEntry.ownerInstanceId;

      // Mark the task as started so the owner-gated `useTaskStream` is enabled.
      act(() => {
        bEntry.setSnapshot({ ...bEntry.getSnapshot(), started: true });
      });

      // Owner's `useTaskStream` should now be called with `enabled: true` in
      // the latest render pass.
      useTaskStreamMock.mockClear();
      act(() => {
        // Poke a snapshot change so we get a fresh render cycle whose mock
        // calls we can inspect cleanly.
        bEntry.setSnapshot({ ...bEntry.getSnapshot() });
      });
      await waitFor(() => {
        expect(
          useTaskStreamMock.mock.calls.filter(
            ([opts]) => opts.enabled === true,
          ).length,
        ).toBeGreaterThanOrEqual(1);
      });

      // Unmount ConsumerA. Sibling effect ordering means ConsumerA ran its
      // claim effect first and therefore owns the entry. Unmounting it must
      // propagate ownership to ConsumerB via the hasOwner watchdog.
      useTaskStreamMock.mockClear();
      act(() => {
        setShowA!(false);
      });

      // After unmount: entry still exists (C1 invariant), one subscriber
      // remains, and ownership has moved to a different instance id.
      expect(bEntry.subscribers.size).toBe(1);
      expect(bEntry.ownerInstanceId).not.toBeNull();
      // The key C2 assertion: ownership did not stay with the unmounted
      // instance — it transferred to the surviving subscriber.
      expect(bEntry.ownerInstanceId).not.toBe(originalOwnerId);
      // The sole remaining subscriber is the new owner.
      const remaining = Array.from(bEntry.subscribers);
      expect(remaining).toEqual([bEntry.ownerInstanceId]);
      // And `useTaskStream` for the surviving consumer is enabled — the
      // stream continues without needing an external prod.
      await waitFor(() => {
        expect(
          useTaskStreamMock.mock.calls.filter(
            ([opts]) => opts.enabled === true,
          ).length,
        ).toBeGreaterThanOrEqual(1);
      });
    },
  );

  it("clears started state when the tasks list shows the scoped task completed", async () => {
    const key: TaskKey = {
      taskType: "stage_asset",
      project: "demo",
      episode: 0,
      scope: "scene:hall:pano_sharp",
    };
    const renders: ReturnType<typeof useTaskController>[] = [];
    let force: (() => void) | null = null;

    function Probe() {
      const [, setTick] = useState(0);
      force = () => setTick((n) => n + 1);
      const handle = useTaskController({
        key,
        invalidateKeys: [["projects", "demo", "scenes"]],
      });
      renders.push(handle);
      return null;
    }

    taskQueryMockState.data = { data: [] };
    renderWithProvider(<Probe />, false);

    act(() => {
      renders[renders.length - 1].start({ scope: "stage_asset__abc123", taskId: "stage-run" });
    });
    expect(renders[renders.length - 1].started).toBe(true);

    taskQueryMockState.data = {
      data: [
        {
          task_type: "stage_asset",
          task_id: "stage-run",
          episode: 0,
          scope: "stage_asset__abc123",
          status: "completed",
          progress: 1,
          current_task: "完成",
          result: { ok: true },
          logs: ["完成"],
        },
      ],
    };
    act(() => {
      force?.();
    });

    await waitFor(() => {
      expect(renders[renders.length - 1].started).toBe(false);
    });
    const latest = renders[renders.length - 1];
    expect(latest.started).toBe(false);
    expect(latest.stream.status).toBe("completed");
    expect(latest.stream.progress).toBe(1);
  });
});
