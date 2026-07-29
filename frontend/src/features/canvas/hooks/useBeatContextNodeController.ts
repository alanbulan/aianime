// Copyright (c) 2026 AI anime
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  addBeatContextSelection,
  areBeatContextListsEqual,
  BEAT_CONTEXT_NO_CHARACTER_MARKER,
  BEAT_CONTEXT_NO_PROP_MARKER,
  buildBeatUpdatePayloadFromNodeData,
  buildLocalBeatContextPatch,
  buildStandaloneBeatContextPatch,
  coerceBeatContextStringList,
  detectBeatContextMention,
  filterBeatContextMentionCandidates,
  isStandaloneBeatContextData,
  mergeRestoredBeatContextCanvas,
  projectBeatContextMentionCandidates,
  resolveBeatContextNodeSize,
  resolveBeatContextSnapshot,
  resolveBeatContextTitle,
  resolveBeatContextWorkbenchTarget,
  toggleBeatContextSelection,
  type BeatContextMentionCandidate,
  type BeatContextMentionContext,
  type StandaloneBeatContextPatch,
} from '@/features/canvas/application/beatContextNodeModel';
import { buildBeatContextNodeRefreshPatch } from '@/features/canvas/application/beatContextRefreshProjection';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  createCanvasFromPreset,
  getFreezoneCanvas,
} from '@/features/canvas/composition';
import { syncBeatContextMainlineEdges } from '@/features/canvas/domain/beatContextRoleBindings';
import type {
  BeatContextNodeData,
  CanvasEdge,
  CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
import {
  applyRemoteFreezoneCanvas,
  extractMainlineContextsFromNode,
  flushFreezoneCanvasRuntime,
  getFreezoneCanvasMetadata,
  listFreezoneBeatContext,
  openPresetProjectionInMyCanvas,
  parseBeatContextVisualMarkers,
  presetRequestFromMetadata,
} from '@/features/freezone/public';
import {
  updateBeat,
  useEpisodeBeats,
  useEpisodeDetail,
  type BeatUpdate,
} from '@/modules/narrative_planning/public';
import { queryKeys } from '@/lib/query-keys';
import { sceneNameToRef, sceneRefToName } from '@/lib/scene-ref';
import { timeOfDayOptions } from '@/lib/time-of-day';
import { readUrl } from '@/lib/url-params';

export interface BeatContextNodeControllerOptions {
  id: string;
  data: BeatContextNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}

function syncBeatContextMainlineLinks(
  beatContextNodeId: string,
  identities: string[],
  props: string[],
): void {
  const store = useCanvasStore.getState();
  const nextEdges = syncBeatContextMainlineEdges(
    beatContextNodeId,
    identities,
    props,
    store.nodes,
    store.edges,
  );
  if (nextEdges !== store.edges) store.replaceEdges(nextEdges);
}

async function restoreCurrentMainlinePresetCanvas(
  projectId: string,
): Promise<boolean> {
  const canvasId = readUrl().canvas ?? 'default';
  const metadata = getFreezoneCanvasMetadata();
  const request = presetRequestFromMetadata(metadata?.preset);
  if (!request) return false;
  const flushed = await flushFreezoneCanvasRuntime(projectId, canvasId);
  if (flushed === false) {
    throw new Error('当前画布还有未保存冲突，处理后再同步主线视图');
  }

  const localState = useCanvasStore.getState();
  const localNodes = localState.nodes;
  const localEdges = localState.edges;
  const baseline = await getFreezoneCanvas(projectId, canvasId);
  await createCanvasFromPreset(projectId, {
    ...request,
    canvas_id: canvasId,
    overwrite_existing: true,
    base_revision: baseline.revision ?? undefined,
  });
  const remote = await getFreezoneCanvas(projectId, canvasId);
  const appliedBySyncRuntime = applyRemoteFreezoneCanvas(
    projectId,
    canvasId,
    remote,
    (remoteNodes, remoteEdges) =>
      mergeRestoredBeatContextCanvas(
        remoteNodes,
        remoteEdges,
        localNodes,
        localEdges,
      ),
  );
  if (!appliedBySyncRuntime) {
    const merged = mergeRestoredBeatContextCanvas(
      (remote.nodes ?? []) as CanvasNode[],
      (remote.edges ?? []) as CanvasEdge[],
      localNodes,
      localEdges,
    );
    useCanvasStore.getState().setCanvasData(merged.nodes, merged.edges);
  }
  return true;
}

export function useBeatContextNodeController({
  id,
  data,
  width,
  height,
  selected,
}: BeatContextNodeControllerOptions) {
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const size = resolveBeatContextNodeSize(width, height);
  const isStandaloneContext = isStandaloneBeatContextData(data);
  const snapshot = useMemo(() => resolveBeatContextSnapshot(data), [data]);
  const contexts = extractMainlineContextsFromNode({ data });
  const titleFromData = resolveBeatContextTitle(data);
  const title =
    isStandaloneContext &&
    [
      '自定义 Beat Context',
      '自定义 Beat 上下文',
      'Beat Context',
      '自定义镜头上下文',
    ].includes(titleFromData)
      ? t('node.beatContextNode.standaloneTitle', {
          defaultValue: '自定义镜头上下文',
        })
      : titleFromData;
  const episode =
    typeof data.episode === 'number' ? data.episode : contexts[0]?.episode;
  const beat = typeof data.beat === 'number' ? data.beat : contexts[0]?.beat;
  const beatContext = contexts.find((context) => context.kind === 'beat');
  const projectId =
    typeof data.projectId === 'string' ? data.projectId : beatContext?.projectId;
  const workbenchTarget = useMemo(
    () => resolveBeatContextWorkbenchTarget(data),
    [data],
  );
  const persistedSyncStatus =
    data.syncStatus === 'syncing' ? 'fresh' : (data.syncStatus ?? 'fresh');
  const [isSyncing, setIsSyncing] = useState(false);
  const syncStatus = isSyncing ? 'syncing' : persistedSyncStatus;
  const [openingWorkbench, setOpeningWorkbench] = useState(false);
  const [editVersion, setEditVersion] = useState(0);
  const visualInitial = String(
    snapshot.visualDescription || data.content || '',
  );
  const snapshotIdentities = useMemo(
    () => coerceBeatContextStringList(snapshot.detectedIdentities),
    [snapshot.detectedIdentities],
  );
  const snapshotProps = useMemo(
    () => coerceBeatContextStringList(snapshot.detectedProps),
    [snapshot.detectedProps],
  );
  const [visualDraft, setVisualDraft] = useState(visualInitial);
  const [identityDraft, setIdentityDraft] = useState(snapshotIdentities);
  const [propDraft, setPropDraft] = useState(snapshotProps);
  const identityColorKey = JSON.stringify(snapshot.sketchColors ?? {});
  const propColorKey = JSON.stringify(snapshot.propMarkerColors ?? {});
  const [identityColorDraft, setIdentityColorDraft] = useState<
    Record<string, string>
  >(() => ({ ...(snapshot.sketchColors ?? {}) }));
  const [propColorDraft, setPropColorDraft] = useState<
    Record<string, string>
  >(() => ({ ...(snapshot.propMarkerColors ?? {}) }));
  const [mentionContext, setMentionContext] =
    useState<BeatContextMentionContext | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [activeIdentityPaletteId, setActiveIdentityPaletteId] = useState<
    string | null
  >(null);
  const [activePropPaletteId, setActivePropPaletteId] = useState<string | null>(
    null,
  );
  const sceneInitial = sceneRefToName({
    scene_id: snapshot.sceneId,
    variant_id: snapshot.sceneVariantId,
  });
  const timeInitial = String(snapshot.timeOfDay || '');
  const [sceneDraft, setSceneDraft] = useState(sceneInitial);
  const [timeDraft, setTimeDraft] = useState(timeInitial);
  const visualTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const episodeQuery = useEpisodeDetail(
    projectId ?? '',
    typeof episode === 'number' ? episode : 0,
    { enabled: selected === true && !isStandaloneContext },
  );
  const beatsQuery = useEpisodeBeats(
    projectId ?? '',
    typeof episode === 'number' ? episode : 0,
    { enabled: selected === true && !isStandaloneContext },
  );
  const episodeIdentityIds = useMemo(
    () => coerceBeatContextStringList(episodeQuery.data?.data?.identity_ids),
    [episodeQuery.data],
  );
  const episodePropIds = useMemo(
    () =>
      (episodeQuery.data?.data?.prop_menu ?? [])
        .map((item) => item.prop_id)
        .filter(Boolean),
    [episodeQuery.data],
  );
  const identityOptions = useMemo(() => {
    if (!isStandaloneContext) {
      return [BEAT_CONTEXT_NO_CHARACTER_MARKER, ...episodeIdentityIds];
    }
    const markers = parseBeatContextVisualMarkers(visualDraft.trim());
    return [BEAT_CONTEXT_NO_CHARACTER_MARKER, ...markers.identities];
  }, [episodeIdentityIds, isStandaloneContext, visualDraft]);
  const propOptions = useMemo(() => {
    if (!isStandaloneContext) {
      return [BEAT_CONTEXT_NO_PROP_MARKER, ...episodePropIds];
    }
    const markers = parseBeatContextVisualMarkers(visualDraft.trim());
    return [BEAT_CONTEXT_NO_PROP_MARKER, ...markers.props];
  }, [episodePropIds, isStandaloneContext, visualDraft]);
  const sceneOptions = useMemo(() => {
    const options = new Set<string>();
    for (const item of episodeQuery.data?.data?.scene_menu ?? []) {
      if (item.time_of_day?.trim()) continue;
      const sceneId = item.scene_id?.trim();
      if (sceneId) options.add(sceneId);
    }
    for (const beatItem of beatsQuery.data?.data ?? []) {
      const sceneId = (
        sceneRefToName(beatItem.scene_ref) ||
        beatItem.location ||
        ''
      ).trim();
      if (sceneId) options.add(sceneId);
    }
    if (sceneInitial) options.add(sceneInitial);
    return Array.from(options);
  }, [beatsQuery.data, episodeQuery.data, sceneInitial]);
  const sceneRefRecords = useMemo(
    () =>
      (episodeQuery.data?.data?.scene_menu ?? []).map((item) => ({
        scene_id: item.scene_id,
        base_scene_id: item.base_scene_id,
        variant_id: item.variant_id,
        time_of_day: item.time_of_day,
      })),
    [episodeQuery.data],
  );
  const timeOptions = useMemo(() => {
    const beatTimes = (beatsQuery.data?.data ?? []).map(
      (beatItem) => beatItem.time_of_day ?? '',
    );
    return timeOfDayOptions(timeInitial, timeDraft, ...beatTimes);
  }, [beatsQuery.data, timeDraft, timeInitial]);
  const mentionCandidates = useMemo(
    () =>
      projectBeatContextMentionCandidates({
        standalone: isStandaloneContext,
        identityIds: episodeIdentityIds,
        propIds: episodePropIds,
      }),
    [episodeIdentityIds, episodePropIds, isStandaloneContext],
  );
  const filteredMentionCandidates = useMemo(
    () => filterBeatContextMentionCandidates(mentionCandidates, mentionContext),
    [mentionCandidates, mentionContext],
  );

  useEffect(() => {
    setVisualDraft(visualInitial);
    setIdentityDraft(snapshotIdentities);
    setPropDraft(snapshotProps);
    setSceneDraft(sceneInitial);
    setTimeDraft(timeInitial);
    setIdentityColorDraft({ ...(snapshot.sketchColors ?? {}) });
    setPropColorDraft({ ...(snapshot.propMarkerColors ?? {}) });
    setMentionContext(null);
    setActiveIdentityPaletteId(null);
    setActivePropPaletteId(null);
  }, [
    editVersion,
    identityColorKey,
    propColorKey,
    sceneInitial,
    snapshotIdentities,
    snapshotProps,
    timeInitial,
    visualInitial,
  ]);

  useEffect(() => {
    if (data.syncStatus === 'syncing') {
      updateNodeData(id, { syncStatus: 'fresh', errorMessage: '' });
    }
  }, [data.syncStatus, id, updateNodeData]);

  const syncToMainline = useCallback(async () => {
    if (
      !projectId ||
      typeof episode !== 'number' ||
      typeof beat !== 'number'
    ) {
      updateNodeData(id, {
        syncStatus: 'error',
        errorMessage: '缺少 project/episode/beat，无法同步到主线',
      });
      return;
    }
    setIsSyncing(true);
    updateNodeData(id, { syncStatus: 'fresh', errorMessage: '' });
    try {
      const latestState = useCanvasStore.getState();
      const latestNode = latestState.nodes.find((node) => node.id === id);
      const latestData =
        latestNode?.data && typeof latestNode.data === 'object'
          ? (latestNode.data as BeatContextNodeData)
          : data;
      await updateBeat(
        projectId,
        episode,
        beat,
        buildBeatUpdatePayloadFromNodeData(latestData),
      );
      const response = await queryClient.fetchQuery({
        queryKey: queryKeys.freezoneBeatContext(projectId, episode, beat),
        queryFn: ({ signal }) =>
          listFreezoneBeatContext(projectId, { episode, beat, signal }),
        staleTime: 0,
      });
      const latestBeat =
        response.episodes
          .find((item) => item.episode === episode)
          ?.beats.find((item) => item.beat === beat) ?? null;
      if (!latestBeat) throw new Error(`EP${episode} Beat ${beat} not found`);
      const refreshPatch = buildBeatContextNodeRefreshPatch(
        projectId,
        latestBeat,
        latestData,
      );
      updateNodeData(id, refreshPatch);
      syncBeatContextMainlineLinks(
        id,
        coerceBeatContextStringList(
          refreshPatch.snapshot?.detectedIdentities,
        ),
        coerceBeatContextStringList(refreshPatch.snapshot?.detectedProps),
      );
      await restoreCurrentMainlinePresetCanvas(projectId);
      setEditVersion((version) => version + 1);
    } catch (error) {
      updateNodeData(id, {
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSyncing(false);
    }
  }, [beat, data, episode, id, projectId, queryClient, updateNodeData]);

  const updateBeatField = useCallback(
    (patch: BeatUpdate) => {
      if (
        !projectId ||
        typeof episode !== 'number' ||
        typeof beat !== 'number'
      ) {
        updateNodeData(id, {
          syncStatus: 'error',
          errorMessage: '缺少 project/episode/beat，无法更新本地上下文',
        });
        return;
      }
      const localPatch = buildLocalBeatContextPatch(data, patch);
      updateNodeData(id, localPatch);
      syncBeatContextMainlineLinks(
        id,
        coerceBeatContextStringList(
          localPatch.snapshot?.detectedIdentities,
        ),
        coerceBeatContextStringList(localPatch.snapshot?.detectedProps),
      );
    },
    [beat, data, episode, id, projectId, updateNodeData],
  );

  const patchStandaloneBeatContext = useCallback(
    (patch: StandaloneBeatContextPatch) => {
      updateNodeData(id, buildStandaloneBeatContextPatch(data, patch));
    },
    [data, id, updateNodeData],
  );

  const updateMentionContext = useCallback((textarea: HTMLTextAreaElement) => {
    setMentionContext(
      detectBeatContextMention(
        textarea.value,
        textarea.selectionStart ?? textarea.value.length,
      ),
    );
    setMentionActiveIndex(0);
  }, []);

  const saveVisualDraft = useCallback(() => {
    const next = visualDraft.trim();
    if (isStandaloneContext) {
      const parsed = parseBeatContextVisualMarkers(next);
      const nextIdentities =
        parsed.identities.length === 0 ||
        identityDraft.includes(BEAT_CONTEXT_NO_CHARACTER_MARKER)
          ? [BEAT_CONTEXT_NO_CHARACTER_MARKER]
          : identityDraft.filter((value) =>
              parsed.identities.includes(value),
            );
      const nextProps =
        parsed.props.length === 0 ||
        propDraft.includes(BEAT_CONTEXT_NO_PROP_MARKER)
          ? [BEAT_CONTEXT_NO_PROP_MARKER]
          : propDraft.filter((value) => parsed.props.includes(value));
      setIdentityDraft(nextIdentities);
      setPropDraft(nextProps);
      patchStandaloneBeatContext({
        visual_description: next,
        detected_identities: nextIdentities,
        detected_props: nextProps,
      });
      return;
    }
    if (next !== visualInitial.trim()) {
      updateBeatField({ visual_description: next });
    }
  }, [
    identityDraft,
    isStandaloneContext,
    patchStandaloneBeatContext,
    propDraft,
    updateBeatField,
    visualDraft,
    visualInitial,
  ]);

  const toggleIdentity = useCallback(
    (identityId: string) => {
      const next = toggleBeatContextSelection(
        identityDraft,
        identityId,
        BEAT_CONTEXT_NO_CHARACTER_MARKER,
      );
      setIdentityDraft(next);
      if (isStandaloneContext) {
        patchStandaloneBeatContext({ detected_identities: next });
      } else if (!areBeatContextListsEqual(next, snapshotIdentities)) {
        updateBeatField({ detected_identities: next });
      }
    },
    [
      identityDraft,
      isStandaloneContext,
      patchStandaloneBeatContext,
      snapshotIdentities,
      updateBeatField,
    ],
  );

  const toggleProp = useCallback(
    (propId: string) => {
      const next = toggleBeatContextSelection(
        propDraft,
        propId,
        BEAT_CONTEXT_NO_PROP_MARKER,
      );
      setPropDraft(next);
      if (isStandaloneContext) {
        patchStandaloneBeatContext({ detected_props: next });
      } else if (!areBeatContextListsEqual(next, snapshotProps)) {
        updateBeatField({ detected_props: next });
      }
    },
    [
      isStandaloneContext,
      patchStandaloneBeatContext,
      propDraft,
      snapshotProps,
      updateBeatField,
    ],
  );

  const updateIdentityColor = useCallback(
    (identityId: string, color: string) => {
      const next = { ...identityColorDraft, [identityId]: color };
      setIdentityColorDraft(next);
      setActiveIdentityPaletteId(null);
      patchStandaloneBeatContext({ sketch_colors: next });
    },
    [identityColorDraft, patchStandaloneBeatContext],
  );

  const updatePropColor = useCallback(
    (propId: string, color: string) => {
      const next = { ...propColorDraft, [propId]: color };
      setPropColorDraft(next);
      setActivePropPaletteId(null);
      patchStandaloneBeatContext({ prop_marker_colors: next });
    },
    [patchStandaloneBeatContext, propColorDraft],
  );

  const insertMention = useCallback(
    (candidate: BeatContextMentionCandidate) => {
      const textarea = visualTextareaRef.current;
      const caret = textarea?.selectionStart ?? visualDraft.length;
      const context = mentionContext ?? detectBeatContextMention(visualDraft, caret);
      if (!context) return;
      const before = visualDraft.slice(0, context.start);
      const after = visualDraft.slice(context.end);
      const spacer = after.length > 0 && !after.startsWith(' ') ? ' ' : '';
      const nextText = `${before}${candidate.token}${spacer}${after}`;
      const nextCaret = isStandaloneContext
        ? before.length + 2
        : before.length + candidate.token.length + spacer.length;
      const patch: BeatUpdate = { visual_description: nextText.trim() };
      setVisualDraft(nextText);
      setMentionContext(null);

      if (isStandaloneContext) {
        window.requestAnimationFrame(() => {
          textarea?.focus();
          textarea?.setSelectionRange(nextCaret, nextCaret);
        });
        patchStandaloneBeatContext({ visual_description: nextText.trim() });
        return;
      }
      if (candidate.kind === 'identity') {
        const nextIdentities = addBeatContextSelection(
          identityDraft,
          candidate.id,
          BEAT_CONTEXT_NO_CHARACTER_MARKER,
        );
        setIdentityDraft(nextIdentities);
        patch.detected_identities = nextIdentities;
      } else {
        const nextProps = addBeatContextSelection(
          propDraft,
          candidate.id,
          BEAT_CONTEXT_NO_PROP_MARKER,
        );
        setPropDraft(nextProps);
        patch.detected_props = nextProps;
      }
      window.requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(nextCaret, nextCaret);
      });
      updateBeatField(patch);
    },
    [
      identityDraft,
      isStandaloneContext,
      mentionContext,
      patchStandaloneBeatContext,
      propDraft,
      updateBeatField,
      visualDraft,
    ],
  );

  const handleVisualKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      event.stopPropagation();
      if (mentionContext && filteredMentionCandidates.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setMentionActiveIndex(
            (index) => (index + 1) % filteredMentionCandidates.length,
          );
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setMentionActiveIndex(
            (index) =>
              (index - 1 + filteredMentionCandidates.length) %
              filteredMentionCandidates.length,
          );
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          insertMention(
            filteredMentionCandidates[mentionActiveIndex] ??
              filteredMentionCandidates[0],
          );
          return;
        }
      }
      if (event.key === 'Escape') setMentionContext(null);
    },
    [
      filteredMentionCandidates,
      insertMention,
      mentionActiveIndex,
      mentionContext,
    ],
  );

  const openWorkbench = useCallback(async () => {
    if (!workbenchTarget || openingWorkbench) return;
    const targetProjectId = readUrl().project || projectId;
    if (!targetProjectId) return;
    setOpeningWorkbench(true);
    try {
      await openPresetProjectionInMyCanvas(targetProjectId, {
        scope: workbenchTarget.scope,
        episode: workbenchTarget.episode,
        beat: workbenchTarget.beat,
        primary_slot: 'render',
      });
    } finally {
      setOpeningWorkbench(false);
    }
  }, [openingWorkbench, projectId, workbenchTarget]);

  const changeScene = useCallback(
    (value: string) => {
      setSceneDraft(value);
      if (value === sceneInitial) return;
      const nextRef = sceneNameToRef(value, sceneRefRecords);
      updateBeatField({
        scene_ref: {
          scene_id: nextRef.scene_id,
          variant_id: nextRef.variant_id,
        },
      });
    },
    [sceneInitial, sceneRefRecords, updateBeatField],
  );

  const changeTime = useCallback(
    (value: string) => {
      setTimeDraft(value);
      if (value !== timeInitial) updateBeatField({ time_of_day: value });
    },
    [timeInitial, updateBeatField],
  );

  return {
    data,
    selected,
    size,
    title,
    contexts,
    episode,
    beat,
    isStandaloneContext,
    snapshot,
    workbenchTarget,
    syncStatus,
    isSyncing,
    openingWorkbench,
    editVersion,
    visualDraft,
    identityDraft,
    propDraft,
    identityColorDraft,
    propColorDraft,
    sceneDraft,
    timeDraft,
    identityOptions,
    propOptions,
    sceneOptions,
    timeOptions,
    mentionContext,
    mentionActiveIndex,
    filteredMentionCandidates,
    activeIdentityPaletteId,
    activePropPaletteId,
    visualTextareaRef,
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    changeVisualDraft: (textarea: HTMLTextAreaElement) => {
      setVisualDraft(textarea.value);
      updateMentionContext(textarea);
    },
    updateMentionContext,
    activateMention: setMentionActiveIndex,
    insertMention,
    handleVisualKeyDown,
    blurVisualDraft: () => {
      setMentionContext(null);
      saveVisualDraft();
    },
    changeScene,
    changeTime,
    toggleIdentity,
    toggleProp,
    toggleIdentityPalette: (identityId: string) =>
      setActiveIdentityPaletteId((current) =>
        current === identityId ? null : identityId,
      ),
    togglePropPalette: (propId: string) =>
      setActivePropPaletteId((current) =>
        current === propId ? null : propId,
      ),
    updateIdentityColor,
    updatePropColor,
    openWorkbench,
    syncToMainline,
  };
}

export type BeatContextNodeController = ReturnType<
  typeof useBeatContextNodeController
>;
