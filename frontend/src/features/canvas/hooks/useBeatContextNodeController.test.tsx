// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BeatContextNodeData } from '@/features/canvas/domain/canvasNodes';
import { useBeatContextNodeController } from './useBeatContextNodeController';

const mocks = vi.hoisted(() => ({
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  replaceEdges: vi.fn(),
  setCanvasData: vi.fn(),
  syncMainlineEdges: vi.fn(),
  updateBeat: vi.fn(),
  fetchQuery: vi.fn(),
  listBeatContext: vi.fn(),
  buildRefreshPatch: vi.fn(),
  flushRuntime: vi.fn(),
  getMetadata: vi.fn(),
  presetRequest: vi.fn(),
  getCanvas: vi.fn(),
  createCanvasFromPreset: vi.fn(),
  applyRemoteCanvas: vi.fn(),
  openWorkbench: vi.fn(),
  episodeDetail: vi.fn(),
  episodeBeats: vi.fn(),
  storeNodes: [] as Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: unknown;
  }>,
  storeEdges: [] as Array<{
    id: string;
    source: string;
    target: string;
    data?: unknown;
  }>,
  episodeData: null as unknown,
  beatsData: null as unknown,
}));

const routeContext = {
  projectId: 'project-url',
  canvasId: 'canvas-a',
} as const;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: mocks.fetchQuery }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key),
  }),
}));

vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

vi.mock('@/features/canvas/canvasStore', () => {
  const state = () => ({
    nodes: mocks.storeNodes,
    edges: mocks.storeEdges,
    setSelectedNode: mocks.setSelectedNode,
    updateNodeData: mocks.updateNodeData,
    replaceEdges: mocks.replaceEdges,
    setCanvasData: mocks.setCanvasData,
  });
  const useCanvasStore = (
    selector: (value: ReturnType<typeof state>) => unknown,
  ) => selector(state());
  useCanvasStore.getState = state;
  return { useCanvasStore };
});

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  applyRemoteFreezoneCanvas: (...args: unknown[]) =>
    mocks.applyRemoteCanvas(...args),
  buildBeatContextNodeRefreshPatch: (...args: unknown[]) =>
    mocks.buildRefreshPatch(...args),
  createCanvasFromPreset: (...args: unknown[]) =>
    mocks.createCanvasFromPreset(...args),
  extractMainlineContextsFromNode: ({ data }: { data: BeatContextNodeData }) =>
    Array.isArray(data.mainline_context) ? data.mainline_context : [],
  flushFreezoneCanvasRuntime: (...args: unknown[]) =>
    mocks.flushRuntime(...args),
  getFreezoneCanvas: (...args: unknown[]) => mocks.getCanvas(...args),
  getFreezoneCanvasMetadata: () => mocks.getMetadata(),
  isCanonicalPushTarget: () => false,
  isPresetManagedEdge: (edge: { data?: { preset_managed?: unknown } }) =>
    edge.data?.preset_managed === true,
  isPresetManagedNode: (node: { data?: { preset_managed?: unknown } }) =>
    node.data?.preset_managed === true,
  listFreezoneBeatContext: (...args: unknown[]) =>
    mocks.listBeatContext(...args),
  openPresetProjectionInMyCanvas: (...args: unknown[]) =>
    mocks.openWorkbench(...args),
  parseBeatContextVisualMarkers: (value: string) => ({
    identities: Array.from(value.matchAll(/\{\{([^}]+)\}\}/g)).map(
      (match) => match[1],
    ),
    props: Array.from(value.matchAll(/\[\[([^\]]+)\]\]/g)).map(
      (match) => match[1],
    ),
  }),
  presetRequestFromMetadata: (...args: unknown[]) =>
    mocks.presetRequest(...args),
  syncBeatContextMainlineEdges: (...args: unknown[]) =>
    mocks.syncMainlineEdges(...args),
}));

vi.mock('@/modules/narrative_planning/public', () => ({
  updateBeat: (...args: unknown[]) => mocks.updateBeat(...args),
  useEpisodeDetail: (...args: unknown[]) => {
    mocks.episodeDetail(...args);
    return { data: mocks.episodeData };
  },
  useEpisodeBeats: (...args: unknown[]) => {
    mocks.episodeBeats(...args);
    return { data: mocks.beatsData };
  },
}));

vi.mock('@/lib/query-keys', () => ({
  queryKeys: {
    freezoneBeatContext: (project: string, episode: number, beat: number) => [
      'beat-context',
      project,
      episode,
      beat,
    ],
  },
}));

function mainlineData(
  patch: Partial<BeatContextNodeData> = {},
): BeatContextNodeData {
  return {
    projectId: 'project-a',
    episode: 1,
    beat: 2,
    content: '初始画面',
    snapshot: {
      visualDescription: '初始画面',
      sceneId: 'scene-a',
      timeOfDay: 'day',
      detectedIdentities: ['Alice'],
      detectedProps: [],
    },
    mainline_context: [
      {
        kind: 'beat',
        projectId: 'project-a',
        episode: 1,
        beat: 2,
      },
    ],
    syncStatus: 'fresh',
    ...patch,
  };
}

describe('useBeatContextNodeController', () => {
  beforeEach(() => {
    mocks.storeNodes.splice(0);
    mocks.storeEdges.splice(0);
    mocks.episodeData = {
      data: {
        identity_ids: ['Alice', 'Bob'],
        prop_menu: [{ prop_id: 'Sword' }],
        scene_menu: [
          { scene_id: 'scene-a' },
          { scene_id: 'scene-b', variant_id: 'night' },
        ],
      },
    };
    mocks.beatsData = {
      data: [
        { scene_ref: { scene_id: 'scene-c' }, time_of_day: 'night' },
      ],
    };
    for (const mock of [
      mocks.setSelectedNode,
      mocks.updateNodeData,
      mocks.replaceEdges,
      mocks.setCanvasData,
      mocks.syncMainlineEdges,
      mocks.updateBeat,
      mocks.fetchQuery,
      mocks.listBeatContext,
      mocks.buildRefreshPatch,
      mocks.flushRuntime,
      mocks.getMetadata,
      mocks.presetRequest,
      mocks.getCanvas,
      mocks.createCanvasFromPreset,
      mocks.applyRemoteCanvas,
      mocks.openWorkbench,
      mocks.episodeDetail,
      mocks.episodeBeats,
    ]) {
      mock.mockReset();
    }
    mocks.syncMainlineEdges.mockImplementation(
      (_id, _identities, _props, _nodes, edges) => edges,
    );
    mocks.updateBeat.mockResolvedValue(undefined);
    mocks.fetchQuery.mockResolvedValue({
      episodes: [{ episode: 1, beats: [{ beat: 2 }] }],
    });
    mocks.buildRefreshPatch.mockReturnValue({
      content: '服务端画面',
      snapshot: {
        visualDescription: '服务端画面',
        detectedIdentities: ['Bob'],
        detectedProps: ['Sword'],
      },
      syncStatus: 'fresh',
      errorMessage: '',
    });
    mocks.getMetadata.mockReturnValue(null);
    mocks.presetRequest.mockReturnValue(null);
    mocks.flushRuntime.mockResolvedValue(true);
    mocks.applyRemoteCanvas.mockReturnValue(true);
    mocks.openWorkbench.mockResolvedValue(undefined);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('projects editor catalogs and owns local mainline draft updates', () => {
    const data = mainlineData();
    mocks.storeNodes.push({
      id: 'beat-a',
      type: 'beatContextNode',
      position: { x: 0, y: 0 },
      data,
    });
    mocks.storeEdges.push({ id: 'edge-a', source: 'beat-a', target: 'other' });
    const nextEdges = [
      ...mocks.storeEdges,
      { id: 'edge-b', source: 'beat-a', target: 'identity-b' },
    ];
    mocks.syncMainlineEdges.mockReturnValue(nextEdges);
    const { result } = renderHook(() =>
      useBeatContextNodeController({
        ...routeContext,
        id: 'beat-a',
        data,
        selected: true,
        width: 500,
      }),
    );
    mocks.updateNodeData.mockClear();

    act(() => {
      result.current.select();
      result.current.rename('新标题');
      result.current.toggleIdentity('Bob');
      result.current.changeScene('scene-b');
      result.current.changeTime('night');
    });

    expect(result.current.size).toEqual({ width: 500, height: 560 });
    expect(result.current.identityOptions).toEqual([
      '__NO_CHARACTER__',
      'Alice',
      'Bob',
    ]);
    expect(result.current.propOptions).toEqual(['__NO_PROP__', 'Sword']);
    expect(result.current.sceneOptions).toEqual([
      'scene-a',
      'scene-b',
      'scene-c',
    ]);
    expect(mocks.episodeDetail).toHaveBeenCalledWith('project-a', 1, {
      enabled: true,
    });
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('beat-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('beat-a', {
      displayName: '新标题',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'beat-a',
      expect.objectContaining({
        syncStatus: 'stale',
        snapshot: expect.objectContaining({
          detectedIdentities: ['Alice', 'Bob'],
        }),
      }),
    );
    expect(mocks.replaceEdges).toHaveBeenCalledWith(nextEdges);
  });

  it('owns standalone marker edits and color-palette state', () => {
    const data: BeatContextNodeData = {
      context_scope: 'standalone',
      content: '{{Alice}} 与 [[Sword]]',
      beat_context: {
        source: 'standalone',
        visual_description: '{{Alice}} 与 [[Sword]]',
        detected_identities: ['Alice'],
        detected_props: ['Sword'],
      },
    };
    const { result } = renderHook(() =>
      useBeatContextNodeController({
        ...routeContext,
        id: 'beat-a',
        data,
        selected: true,
      }),
    );
    mocks.updateNodeData.mockClear();

    act(() => result.current.toggleIdentityPalette('Alice'));
    expect(result.current.activeIdentityPaletteId).toBe('Alice');
    act(() => result.current.updateIdentityColor('Alice', '#FF00FF'));
    expect(result.current.activeIdentityPaletteId).toBeNull();
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'beat-a',
      expect.objectContaining({
        beat_context: expect.objectContaining({
          sketch_colors: { Alice: '#FF00FF' },
        }),
      }),
    );
    expect(mocks.episodeDetail).toHaveBeenCalledWith('', 0, {
      enabled: false,
    });
  });

  it('inserts mentions and persists the current visual draft on blur', () => {
    const data = mainlineData({ content: '@Al', snapshot: { visualDescription: '@Al' } });
    const { result } = renderHook(() =>
      useBeatContextNodeController({
        ...routeContext,
        id: 'beat-a',
        data,
        selected: true,
      }),
    );
    const textarea = document.createElement('textarea');
    textarea.value = '@Al';
    textarea.selectionStart = 3;
    act(() => result.current.changeVisualDraft(textarea));
    expect(result.current.filteredMentionCandidates[0]).toMatchObject({
      id: 'Alice',
    });
    act(() => result.current.insertMention(result.current.filteredMentionCandidates[0]));
    expect(result.current.visualDraft).toBe('{{Alice}}');
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'beat-a',
      expect.objectContaining({
        content: '{{Alice}}',
        snapshot: expect.objectContaining({ detectedIdentities: ['Alice'] }),
      }),
    );
  });

  it('writes the latest node state, refreshes context, and synchronizes links', async () => {
    const data = mainlineData();
    const latestData = mainlineData({
      content: '点击同步前的最新草稿',
      beat_edit_fields: { visual_description: '点击同步前的最新草稿' },
    });
    mocks.storeNodes.push({
      id: 'beat-a',
      type: 'beatContextNode',
      position: { x: 0, y: 0 },
      data: latestData,
    });
    const refreshedEdges = [
      { id: 'edge-new', source: 'beat-a', target: 'identity-b' },
    ];
    mocks.syncMainlineEdges.mockReturnValue(refreshedEdges);
    const { result } = renderHook(() =>
      useBeatContextNodeController({
        ...routeContext,
        id: 'beat-a',
        data,
        selected: true,
      }),
    );

    await act(async () => result.current.syncToMainline());

    expect(mocks.updateBeat).toHaveBeenCalledWith(
      'project-a',
      1,
      2,
      expect.objectContaining({
        visual_description: '点击同步前的最新草稿',
      }),
    );
    expect(mocks.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['beat-context', 'project-a', 1, 2],
        staleTime: 0,
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'beat-a',
      expect.objectContaining({ content: '服务端画面' }),
    );
    expect(mocks.replaceEdges).toHaveBeenCalledWith(refreshedEdges);
    expect(result.current.isSyncing).toBe(false);
  });

  it('restores the preset canvas, opens workbench, and reports missing scope', async () => {
    const data = mainlineData({
      workbench_target: { scope: 'beat', episode: 1, beat: 2 },
    });
    mocks.storeNodes.push(
      {
        id: 'beat-a',
        type: 'beatContextNode',
        position: { x: 0, y: 0 },
        data,
      },
      {
        id: 'local-user',
        type: 'textNode',
        position: { x: 0, y: 0 },
        data: {},
      },
    );
    mocks.getMetadata.mockReturnValue({ preset: { scope: 'beat' } });
    mocks.presetRequest.mockReturnValue({ scope: 'beat', episode: 1, beat: 2 });
    mocks.getCanvas
      .mockResolvedValueOnce({ revision: 4 })
      .mockResolvedValueOnce({
        nodes: [
          {
            id: 'remote',
            type: 'textNode',
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
      });
    mocks.applyRemoteCanvas.mockReturnValue(false);
    const { result } = renderHook(() =>
      useBeatContextNodeController({
        ...routeContext,
        id: 'beat-a',
        data,
        selected: true,
      }),
    );

    await act(async () => result.current.syncToMainline());
    await act(async () => result.current.openWorkbench());

    const syncErrorCall = mocks.updateNodeData.mock.calls.find(
      ([nodeId, patch]) =>
        nodeId === 'beat-a' &&
        typeof patch === 'object' &&
        patch !== null &&
        'syncStatus' in patch &&
        patch.syncStatus === 'error',
    );
    expect(syncErrorCall).toBeUndefined();
    expect(mocks.getCanvas).toHaveBeenCalledTimes(2);
    expect(mocks.createCanvasFromPreset).toHaveBeenCalledWith(
      'project-a',
      expect.objectContaining({
        canvas_id: 'canvas-a',
        overwrite_existing: true,
        base_revision: 4,
      }),
    );
    expect(mocks.setCanvasData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'remote' }),
        expect.objectContaining({ id: 'local-user' }),
      ]),
      [],
    );
    expect(mocks.openWorkbench).toHaveBeenCalledWith('project-url', {
      scope: 'beat',
      episode: 1,
      beat: 2,
      primary_slot: 'render',
    });

    const missing = renderHook(() =>
      useBeatContextNodeController({
        ...routeContext,
        id: 'missing',
        data: {},
      }),
    );
    act(() => missing.result.current.changeTime('night'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('missing', {
      syncStatus: 'error',
      errorMessage: '缺少 project/episode/beat，无法更新本地上下文',
    });
  });
});
