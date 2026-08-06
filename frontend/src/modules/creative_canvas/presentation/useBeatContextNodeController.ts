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
  type BeatContextGraphEdge,
  type BeatContextGraphNode,
  type BeatContextMentionCandidate,
  type BeatContextMentionContext,
  type StandaloneBeatContextPatch,
} from '../application/beatContextNodeModel';
import {
  applyRemoteFreezoneCanvas,
  flushFreezoneCanvasRuntime,
} from '../application/canvasRuntimeState';
import { buildBeatContextNodeRefreshPatch } from '../application/beatContextRefreshProjection';
import { getFreezoneCanvasMetadata } from '../application/canvasMetadataState';
import { presetRequestFromMetadata } from '../application/canvasPreset';
import { extractMainlineContextsFromNode } from '../domain/mainlineContext';
import { parseBeatContextVisualMarkers } from '../domain/currentBeatContext';
import { syncBeatContextMainlineEdges } from '../domain/beatContextRoleBindings';
import type {
  BeatContextNodeData,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
} from '../domain/canvasNodeData';
import type { FreezoneCanvasPayload, FreezonePresetCanvasRequest } from '../domain/canvasStorage';
import type { FreezoneBeatContextResponse } from '../domain/beatContext';
import type { OpenPresetProjectionRequest } from '../application/openPresetProjection';

import {
  updateBeat,
  useEpisodeBeats,
  useEpisodeDetail,
  type BeatUpdate,
} from '@/modules/narrative_planning/public';
import { queryKeys } from '@/lib/query-keys';
import { sceneNameToRef, sceneRefToName } from '@/lib/scene-ref';
import { timeOfDayOptions } from '@/lib/time-of-day';

export interface BeatContextNodeControllerOptions {
  id: string;
  data: BeatContextNodeData;
  projectId: string;
  canvasId: string;
  selected?: boolean;
  width?: number;
  height?: number;
}

export interface BeatContextNodeStore {
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  replaceEdges: (edges: CanvasEdge[]) => void;
  setCanvasData: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
}

export type BeatContextNodeStoreHook = <TSelected>(
  selector: (state: BeatContextNodeStore) => TSelected,
) => TSelected;

export type BeatContextNodeGetCanvas = (
  projectId: string,
  canvasId: string,
) => Promise<FreezoneCanvasPayload>;

export type BeatContextNodeCreateCanvasFromPreset = (
  projectId: string,
  request: FreezonePresetCanvasRequest,
) => Promise<unknown>;

export type BeatContextNodeListBeatContext = (
  projectId: string,
  params: { episode: number; beat: number; signal?: AbortSignal },
) => Promise<FreezoneBeatContextResponse>;

export type BeatContextNodeOpenWorkbench = (
  projectId: string,
  params: OpenPresetProjectionRequest,
) => Promise<unknown>;

export function createUseBeatContextNodeController({
  useStore,
  getFreezoneCanvas,
  createCanvasFromPreset,
  listFreezoneBeatContext,
  openPresetProjectionInMyCanvas,
  readGraph,
  readNodeData,
}: {
  useStore: BeatContextNodeStoreHook;
  getFreezoneCanvas: BeatContextNodeGetCanvas;
  createCanvasFromPreset: BeatContextNodeCreateCanvasFromPreset;
  listFreezoneBeatContext: BeatContextNodeListBeatContext;
  openPresetProjectionInMyCanvas: BeatContextNodeOpenWorkbench;
  readGraph: () => {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
  };
  readNodeData: (nodeId: string) => BeatContextNodeData | undefined;
}) {
  return function useBeatContextNodeController({
    id,
    data,
    projectId,
    canvasId,
    width,
    height,
    selected,
  }: BeatContextNodeControllerOptions) {
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const updateNodeData = useStore((state) => state.updateNodeData);
    const replaceEdges = useStore((state) => state.replaceEdges);
    const setCanvasData = useStore((state) => state.setCanvasData);
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
    const beatProjectId =
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
      beatProjectId ?? '',
      typeof episode === 'number' ? episode : 0,
      { enabled: selected === true && !isStandaloneContext },
    );
    const beatsQuery = useEpisodeBeats(
      beatProjectId ?? '',
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

    const syncBeatContextMainlineLinks = useCallback(
      (
        beatContextNodeId: string,
        identities: string[],
        props: string[],
      ) => {
        const { nodes, edges } = readGraph();
        const nextEdges = syncBeatContextMainlineEdges(
          beatContextNodeId,
          identities,
          props,
          nodes,
          edges,
        );
        if (nextEdges !== edges) replaceEdges(nextEdges);
      },
      [readGraph, replaceEdges],
    );

    const restoreCurrentMainlinePresetCanvas = useCallback(
      async (
        targetProjectId: string,
        targetCanvasId: string,
      ): Promise<boolean> => {
        const metadata = getFreezoneCanvasMetadata();
        const request = presetRequestFromMetadata(metadata?.preset);
        if (!request) return false;
        const flushed = await flushFreezoneCanvasRuntime(
          targetProjectId,
          targetCanvasId,
        );
        if (flushed === false) {
          throw new Error('当前画布还有未保存冲突，处理后再同步主线视图');
        }

        const localState = readGraph();
        const localNodes = localState.nodes;
        const localEdges = localState.edges;
        const baseline = await getFreezoneCanvas(targetProjectId, targetCanvasId);
        await createCanvasFromPreset(targetProjectId, {
          ...request,
          canvas_id: targetCanvasId,
          overwrite_existing: true,
          base_revision: baseline.revision ?? undefined,
        });
        const remote = await getFreezoneCanvas(targetProjectId, targetCanvasId);
        const appliedBySyncRuntime = applyRemoteFreezoneCanvas<
          CanvasNode,
          CanvasEdge
        >(
          targetProjectId,
          targetCanvasId,
          remote,
          (remoteNodes, remoteEdges) =>
            mergeRestoredBeatContextCanvas(
              remoteNodes,
              remoteEdges,
              localNodes,
              localEdges,
            ) as unknown as { nodes: CanvasNode[]; edges: CanvasEdge[] },
        );
        if (!appliedBySyncRuntime) {
          const merged = mergeRestoredBeatContextCanvas(
            (remote.nodes ?? []) as unknown as BeatContextGraphNode[],
            (remote.edges ?? []) as unknown as BeatContextGraphEdge[],
            localNodes as unknown as BeatContextGraphNode[],
            localEdges as unknown as BeatContextGraphEdge[],
          ) as unknown as { nodes: CanvasNode[]; edges: CanvasEdge[] };
          setCanvasData(merged.nodes, merged.edges);
        }
        return true;
      },
      [createCanvasFromPreset, getFreezoneCanvas, readGraph, setCanvasData],
    );

    const syncToMainline = useCallback(async () => {
      if (
        !beatProjectId ||
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
        const latestData = readNodeData(id) ?? data;
        await updateBeat(
          beatProjectId,
          episode,
          beat,
          buildBeatUpdatePayloadFromNodeData(latestData),
        );
        const response = await queryClient.fetchQuery({
          queryKey: queryKeys.freezoneBeatContext(beatProjectId, episode, beat),
          queryFn: ({ signal }) =>
            listFreezoneBeatContext(beatProjectId, { episode, beat, signal }),
          staleTime: 0,
        });
        const latestBeat =
          response.episodes
            .find((item) => item.episode === episode)
            ?.beats.find((item) => item.beat === beat) ?? null;
        if (!latestBeat) throw new Error(`EP${episode} Beat ${beat} not found`);
        const refreshPatch = buildBeatContextNodeRefreshPatch(
          beatProjectId,
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
        await restoreCurrentMainlinePresetCanvas(beatProjectId, canvasId);
        setEditVersion((version) => version + 1);
      } catch (error) {
        updateNodeData(id, {
          syncStatus: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsSyncing(false);
      }
    }, [
      beat,
      beatProjectId,
      canvasId,
      data,
      episode,
      id,
      listFreezoneBeatContext,
      queryClient,
      readNodeData,
      restoreCurrentMainlinePresetCanvas,
      syncBeatContextMainlineLinks,
      updateNodeData,
    ]);

    const updateBeatField = useCallback(
      (patch: BeatUpdate) => {
        if (
          !beatProjectId ||
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
      [beat, beatProjectId, data, episode, id, syncBeatContextMainlineLinks, updateNodeData],
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
      if (!workbenchTarget || openingWorkbench || !projectId) return;
      setOpeningWorkbench(true);
      try {
        await openPresetProjectionInMyCanvas(projectId, {
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
  };
}

export type BeatContextNodeController = ReturnType<
  ReturnType<typeof createUseBeatContextNodeController>
>;
