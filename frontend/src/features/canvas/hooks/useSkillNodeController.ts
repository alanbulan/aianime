// Copyright (c) 2026 AI anime
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import {
  createSkillRunNonce,
  directorControlBundleFromMeta,
  directorControlBundleImageUrl,
  directorManifestWithScenePanoSource,
  mergeSkillManifestWithBeatContext,
  numericSkillField,
  projectSkillInputHandleIds,
  projectSkillOutputHandleIds,
  projectSkillOutputPositions,
  projectSkillReferenceInputHandles,
  resolveSkillBeatTarget,
  resolveSkillNodeWidth,
  sceneAssetsFromSkillData,
  selectedBackgroundTarget,
  skillBeatContextReferences,
  skillInputRoleFromEdge,
  skillInputSignature,
  skillNodeErrorMessage,
  skillOutputRoleFromEdge,
  skillRecordValue,
  skillRunIdempotencyKey,
  skillTaskStatusLabelKey,
  SKILL_TASK_RECORD_GRACE_MS,
  type SkillCropSource,
  type SkillDirectorWorldDestination,
} from '@/modules/creative_canvas/public';
import {
  awaitCanvasGenerationTaskCompletion,
  awaitCanvasSkillRunResult,
  getCanvasBeatDirectorManifest,
  getCanvasSceneAssetsForBeat,
  stageSelectedBackgroundOutputForSkill,
  startCanvasSkillRun,
  uploadCanvasAsset,
} from '@/features/canvas/composition';
import {
  type CanvasNode,
  type CanvasNodeData,
  type SkillNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  isSkillRunFailureStatus,
  isSkillReadyToSubmit,
  isSystemManagedNodeData,
  loadCanvasSkillRegistry,
  normalizedSkillParameters,
  nodeDataForOutput,
  nodeTypeForOutput,
  outputLabel,
  outputText,
  publishCanvasCommitRequested,
  resolveInputsForSkill,
  skillParameterEntries,
  skillRunErrorMessage,
  translateSkillDescription,
  translateSkillName,
  useCanvasSkillRegistry,
  useCanvasImageModels,
  type MainlineContext,
  type SceneAssetsForBeat,
  type SkillRunOutput,
} from '@/modules/creative_canvas/public';
import type {
  DirectorControlFrameBundle,
  DirectorStageManifest,
} from '@/features/viewer-kit/public';
import { isActive as isActiveTask } from '@/modules/task_execution/public';
import { useTaskCenterStore } from '@/modules/task_execution/public';

export interface SkillNodeControllerOptions {
  id: string;
  data: SkillNodeData;
  projectId: string;
  canvasId: string;
  selected?: boolean;
  width?: number;
}

interface SkillNodeRouteContext {
  projectId: string;
  canvasId: string;
  active: boolean;
}

interface SkillDirectorCaptureMeta {
  controlFrameUrl?: string;
  controlFrameBundle?: DirectorControlFrameBundle;
}

function assertCurrentRunContext(
  currentContext: SkillNodeRouteContext,
  projectId: string,
  canvasId: string,
  skillNodeId: string,
  runId: string | null,
  startedAt: number | null,
): void {
  if (
    !currentContext.active ||
    currentContext.projectId !== projectId ||
    currentContext.canvasId !== canvasId
  ) {
    throw new Error(
      'Skill run completed after switching canvas; output was not materialized',
    );
  }

  const currentNode = useCanvasStore
    .getState()
    .nodes.find((node) => node.id === skillNodeId);
  if (!currentNode) {
    throw new Error('Skill node was deleted before the run completed');
  }
  const currentData = currentNode.data as {
    generationStartedAt?: unknown;
    skillRunId?: unknown;
  };
  const currentRunId =
    typeof currentData.skillRunId === 'string' ? currentData.skillRunId : '';
  if (runId && currentRunId && currentRunId !== runId) {
    throw new Error('A newer skill run replaced this completion');
  }
  if (!runId || !currentRunId) {
    const currentStartedAt = currentData.generationStartedAt;
    if (startedAt !== null && currentStartedAt !== startedAt) {
      throw new Error('A newer skill run replaced this completion');
    }
  }
}

export function useSkillNodeController({
  id,
  data,
  projectId,
  canvasId,
  selected,
  width,
}: SkillNodeControllerOptions) {
  const { t } = useTranslation();
  const resumeRunRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);
  const currentRouteContextRef = useRef<SkillNodeRouteContext>({
    projectId,
    canvasId,
    active: true,
  });
  currentRouteContextRef.current.projectId = projectId;
  currentRouteContextRef.current.canvasId = canvasId;
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdgeWithData = useCanvasStore((state) => state.addEdgeWithData);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const incomingEdges = useCanvasStore(
    useShallow((state) =>
      state.edges.filter((edge) => edge.target === id),
    ),
  );
  const outgoingEdges = useCanvasStore(
    useShallow((state) =>
      state.edges.filter((edge) => edge.source === id),
    ),
  );
  const sourceNodes = useCanvasStore(
    useShallow((state) => {
      const sourceIds = new Set(
        state.edges
          .filter((edge) => edge.target === id)
          .map((edge) => edge.source),
      );
      return state.nodes.filter((node) => sourceIds.has(node.id));
    }),
  );
  const { skills: registry, isLoading, loadError } = useCanvasSkillRegistry(
    loadCanvasSkillRegistry,
  );
  const { models: imageModels } = useCanvasImageModels(projectId, 'edit');
  const [sceneAssets, setSceneAssets] =
    useState<SceneAssetsForBeat | null>(null);
  const [sourcePickerError, setSourcePickerError] = useState<string | null>(
    null,
  );
  const [sourcePickerBusy, setSourcePickerBusy] = useState(false);
  const [cropSource, setCropSource] = useState<SkillCropSource | null>(null);
  const [directorStageOpen, setDirectorStageOpen] = useState(false);
  const [directorStageManifest, setDirectorStageManifest] =
    useState<DirectorStageManifest | null>(null);
  const [directorWorldDestination, setDirectorWorldDestination] =
    useState<SkillDirectorWorldDestination | null>(null);
  const [submitInFlight, setSubmitInFlight] = useState(false);
  const [taskRecordGraceUntil, setTaskRecordGraceUntil] = useState(0);
  void selected;

  const skill = useMemo(
    () => registry.find((item) => item.id === data.skill_id) ?? null,
    [data.skill_id, registry],
  );
  const dynamicParameterOptions = useMemo(
    () => ({ model: imageModels.map((model) => model.apiModel) }),
    [imageModels],
  );
  const parameterEntries = useMemo(
    () => skillParameterEntries(skill, data.parameters, dynamicParameterOptions),
    [data.parameters, dynamicParameterOptions, skill],
  );
  const skillParameters = useMemo(
    () => normalizedSkillParameters(skill, data.parameters, dynamicParameterOptions),
    [data.parameters, dynamicParameterOptions, skill],
  );
  const generationTaskKey =
    typeof data.generationTaskKey === 'string'
      ? data.generationTaskKey.trim()
      : '';
  const trackedTask = useTaskCenterStore((state) =>
    generationTaskKey ? state.tasks.get(generationTaskKey) ?? null : null,
  );
  const taskCenterHydrated = useTaskCenterStore((state) => state.isHydrated);
  const taskRecordGraceActive = taskRecordGraceUntil > Date.now();
  const nodeById = useMemo(
    () => new Map(sourceNodes.map((node) => [node.id, node] as const)),
    [sourceNodes],
  );
  const beatContextNode = useMemo(() => {
    const beatEdge = incomingEdges.find(
      (edge) => skillInputRoleFromEdge(edge) === 'beat_context',
    );
    return beatEdge ? nodeById.get(beatEdge.source) : undefined;
  }, [incomingEdges, nodeById]);
  const beatContextReferences = useMemo(
    () => skillBeatContextReferences(beatContextNode),
    [beatContextNode],
  );
  const inputHandleIds = useMemo(
    () =>
      projectSkillInputHandleIds({
        skill,
        skillId: data.skill_id,
        references: beatContextReferences,
        incomingEdges,
      }),
    [beatContextReferences, data.skill_id, incomingEdges, skill],
  );
  const referenceInputHandlesByRole = useMemo(
    () =>
      projectSkillReferenceInputHandles({
        skillId: data.skill_id,
        references: beatContextReferences,
        incomingEdges,
      }),
    [beatContextReferences, data.skill_id, incomingEdges],
  );
  const outputHandleIds = useMemo(
    () => projectSkillOutputHandleIds(skill, outgoingEdges),
    [outgoingEdges, skill],
  );
  const beatTarget = useMemo(
    () => resolveSkillBeatTarget(beatContextNode),
    [beatContextNode],
  );
  const requiresImageModel = skill?.parameters?.model?.type === 'image_model';
  const ready = Boolean(
    skill
      && isSkillReadyToSubmit(skill, incomingEdges, nodeById)
      && (!requiresImageModel || skillParameters.model),
  );
  const taskIsActive = trackedTask ? isActiveTask(trackedTask) : false;
  const waitingForTaskRecord =
    data.isGenerating === true &&
    generationTaskKey.length > 0 &&
    !trackedTask &&
    (!taskCenterHydrated || taskRecordGraceActive);
  const isBusy = submitInFlight || taskIsActive || waitingForTaskRecord;
  const submitLabel = t(
    skillTaskStatusLabelKey(
      trackedTask,
      submitInFlight,
      waitingForTaskRecord,
    ),
  );
  const resolvedWidth = resolveSkillNodeWidth(width);
  const isSetSelectedBackgroundSkill =
    data.skill_id === 'freezone.set_selected_background';
  const isSetDirectorCombinedSkill =
    data.skill_id === 'freezone.set_director_combined';
  const localizedSkillName = skill ? translateSkillName(skill, t) : null;
  const localizedSkillDescription = skill
    ? translateSkillDescription(skill, t)
    : null;
  const mainlineManaged = isSystemManagedNodeData(data);
  const embeddedSceneAssets = useMemo(
    () =>
      sceneAssetsFromSkillData(
        (data as Record<string, unknown>).scene_source_urls,
      ),
    [data],
  );
  const directorEnvOnlyPreviewUrl =
    sceneAssets?.director_env_only_url ??
    embeddedSceneAssets?.director_env_only_url ??
    null;

  const stageSelectedBackground = (
    target: { episode?: unknown; beat?: unknown },
    imageUrl: string,
    label?: string,
    extraData?: Partial<CanvasNodeData> & Record<string, unknown>,
  ): string | null => {
    const episode = numericSkillField(target.episode);
    const beat = numericSkillField(target.beat);
    if (episode === null || beat === null) {
      setSourcePickerError('缺少镜头上下文');
      return null;
    }
    const outputNodeId = stageSelectedBackgroundOutputForSkill(
      { episode, beat },
      imageUrl,
      {
        sourceSkillNodeId: id,
        label,
        extraData,
      },
    );
    if (!outputNodeId) {
      setSourcePickerError('没有找到当前背景输出节点');
      return null;
    }
    if (mainlineManaged && !extraData?.committed_at) {
      publishCanvasCommitRequested({
        nodeId: outputNodeId,
        auto: true,
        successMessage: t(
          'viewer.threeD.selectedBackgroundCommitSuccess',
          { episode, beat },
        ),
      });
    }
    return outputNodeId;
  };

  const uploadAndStageSelectedBackground = async (
    blob: Blob,
    filename: string,
    label?: string,
  ) => {
    if (!beatTarget) {
      throw new Error('缺少镜头上下文');
    }
    const uploaded = await uploadCanvasAsset(projectId, blob, filename, {
      disableTimeout: true,
    });
    const nodeId = stageSelectedBackground(beatTarget, uploaded.url, label);
    if (!nodeId) {
      throw new Error('当前背景输出节点不可用');
    }
  };

  const ensureSceneAssets = async (
    fresh = false,
  ): Promise<SceneAssetsForBeat | null> => {
    if (!fresh && embeddedSceneAssets) {
      return embeddedSceneAssets;
    }
    if (!fresh && sceneAssets) {
      return sceneAssets;
    }
    if (!beatTarget) {
      setSourcePickerError('缺少镜头上下文');
      return null;
    }
    setSourcePickerBusy(true);
    setSourcePickerError(null);
    try {
      const assets = await getCanvasSceneAssetsForBeat({
        projectId,
        episode: beatTarget.episode,
        beat: beatTarget.beat,
      });
      setSceneAssets(assets);
      return assets;
    } catch (error) {
      setSourcePickerError(skillNodeErrorMessage(error));
      return null;
    } finally {
      setSourcePickerBusy(false);
    }
  };

  useEffect(() => {
    if (!isSetSelectedBackgroundSkill || !beatTarget) return;
    let cancelled = false;
    setSourcePickerBusy(true);
    void getCanvasSceneAssetsForBeat({
      projectId,
      episode: beatTarget.episode,
      beat: beatTarget.beat,
    })
      .then((assets) => {
        if (!cancelled) setSceneAssets(assets);
      })
      .catch((error) => {
        if (!cancelled) setSourcePickerError(skillNodeErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setSourcePickerBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    beatTarget?.beat,
    beatTarget?.episode,
    isSetSelectedBackgroundSkill,
    projectId,
  ]);

  const handleParameterChange = (key: string, value: string | boolean) => {
    const currentParameters = skillRecordValue(data.parameters) ?? {};
    updateNodeData(id, {
      parameters: {
        ...currentParameters,
        [key]: value,
      },
    });
  };

  const materializeOutputs = (
    outputs: SkillRunOutput[],
    projectId: string,
    canvasId: string,
    runId: string | null,
    startedAt: number | null,
  ) => {
    assertCurrentRunContext(
      currentRouteContextRef.current,
      projectId,
      canvasId,
      id,
      runId,
      startedAt,
    );
    const state = useCanvasStore.getState();
    const sourceNode = state.nodes.find((node) => node.id === id);
    if (!sourceNode) {
      throw new Error('Skill node no longer exists');
    }
    const outputPositions = projectSkillOutputPositions(
      sourceNode.position,
      outputs.length,
    );

    outputs.forEach((output, index) => {
      const latestState = useCanvasStore.getState();
      const boundOutputNodes = latestState.edges
        .filter(
          (edge) =>
            edge.source === id &&
            skillOutputRoleFromEdge(edge) === output.role,
        )
        .map((edge) =>
          latestState.nodes.find((node) => node.id === edge.target),
        )
        .filter((node): node is CanvasNode => Boolean(node));
      if (boundOutputNodes.length > 0) {
        for (const node of boundOutputNodes) {
          const existingData = skillRecordValue(node.data) ?? {};
          const patch: Partial<CanvasNodeData> & Record<string, unknown> = {
            displayName:
              typeof existingData.displayName === 'string' &&
              existingData.displayName.trim()
                ? existingData.displayName
                : outputLabel(output),
            output_role: output.role,
            media_kind: output.media_type,
            candidate_origin: {
              skill_id: data.skill_id,
              skill_node_id: id,
            },
            ...(output.slot_target
              ? { slot_target: output.slot_target }
              : {}),
            ...(Array.isArray(output.mainline_context)
              ? { mainline_context: output.mainline_context }
              : {}),
            ...(skillRecordValue(output.director_control_bundle)
              ? { director_control_bundle: output.director_control_bundle }
              : {}),
          };
          if (output.media_type === 'image') {
            patch.imageUrl = output.image_url ?? null;
            patch.previewImageUrl = output.image_url ?? null;
            patch.committed_slot_url =
              typeof output.committed_slot_url === 'string'
                ? output.committed_slot_url
                : null;
            patch.committed_at = output.committed === true
              ? new Date().toISOString()
              : null;
          } else {
            patch.content = outputText(output);
          }
          updateNodeData(node.id, patch);
        }
        return;
      }

      const selectedTarget = selectedBackgroundTarget(output);
      if (selectedTarget && output.image_url) {
        if (
          stageSelectedBackground(
            selectedTarget,
            output.image_url,
            outputLabel(output),
          )
        ) {
          return;
        }
      }
      const targetId = addNode(
        nodeTypeForOutput(output),
        outputPositions[index],
        nodeDataForOutput(output, data.skill_id, id),
      );
      const edgeId = addEdgeWithData(
        id,
        targetId,
        {
          edgeKind: 'role_binding',
          role: output.role,
          label: outputLabel(output),
          propagates: false,
        },
        {
          id: `e-${id}-${targetId}-${output.role}`,
          sourceHandle: output.role,
          targetHandle: 'target',
        },
      );
      if (!edgeId) {
        useCanvasStore.getState().deleteNode(targetId);
        throw new Error(`Failed to connect skill output ${output.role}`);
      }
    });
  };

  const handleDirectorCombinedCaptureSuccess = async (
    blob: Blob,
    meta?: SkillDirectorCaptureMeta,
  ) => {
    if (!beatTarget) {
      throw new Error(t('viewer.threeD.directorCombinedMissingContext'));
    }
    const bundle = directorControlBundleFromMeta(meta);
    let imageUrl =
      directorControlBundleImageUrl(bundle, 'combined') ||
      meta?.controlFrameUrl ||
      '';
    if (!imageUrl) {
      const uploaded = await uploadCanvasAsset(
        projectId,
        blob,
        `director_combined_3gs_${Date.now()}.png`,
        { disableTimeout: true },
      );
      imageUrl = uploaded.url;
    }
    const directorCombinedContext = {
      kind: 'director_combined',
      projectId,
      episode: beatTarget.episode,
      beat: beatTarget.beat,
      role: 'director_combined',
      sourceUrl: imageUrl,
    } satisfies MainlineContext;
    const output: SkillRunOutput = {
      schema_version: 'skill.v1',
      role: 'director_combined',
      media_type: 'image',
      node_type: 'imageGenNode',
      pushable: true,
      image_url: imageUrl,
      label: t('viewer.threeD.directorCombinedOutputLabel', {
        episode: beatTarget.episode,
        beat: beatTarget.beat,
      }),
      slot_target: {
        kind: 'director_render',
        episode: beatTarget.episode,
        beat: beatTarget.beat,
      },
      mainline_context: [directorCombinedContext],
      ...(bundle
        ? {
            director_control_bundle: bundle,
            committed: true,
            committed_slot_url: imageUrl,
          }
        : {}),
    };
    materializeOutputs([output], projectId, canvasId, null, null);
    const outputNodeId = useCanvasStore
      .getState()
      .edges.find(
        (edge) =>
          edge.source === id &&
          skillOutputRoleFromEdge(edge) === 'director_combined',
      )?.target;
    if (bundle && outputNodeId) {
      updateNodeData(outputNodeId, {
        director_control_bundle: bundle,
        committed_at: new Date().toISOString(),
        committed_slot_url: imageUrl,
      });
    } else if (mainlineManaged && outputNodeId) {
      publishCanvasCommitRequested({
        nodeId: outputNodeId,
        auto: true,
        successMessage: t('viewer.threeD.directorCombinedCommitSuccess', {
          episode: beatTarget.episode,
          beat: beatTarget.beat,
        }),
      });
    }
    setSourcePickerError(null);
  };

  useEffect(() => {
    currentRouteContextRef.current.active = true;
    return () => {
      currentRouteContextRef.current.active = false;
    };
  }, []);

  useEffect(() => {
    setSceneAssets(null);
    setSourcePickerError(null);
  }, [beatTarget?.episode, beatTarget?.beat]);

  useEffect(() => {
    if (taskRecordGraceUntil <= 0) {
      return undefined;
    }
    const remainingMs = taskRecordGraceUntil - Date.now();
    if (remainingMs <= 0) {
      setTaskRecordGraceUntil(0);
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setTaskRecordGraceUntil(0);
    }, remainingMs);
    return () => window.clearTimeout(timeout);
  }, [taskRecordGraceUntil]);

  useEffect(() => {
    if (trackedTask && taskRecordGraceUntil > 0) {
      setTaskRecordGraceUntil(0);
    }
  }, [taskRecordGraceUntil, trackedTask]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, inputHandleIds, outputHandleIds, resolvedWidth, updateNodeInternals]);

  useEffect(() => {
    if (!skill || data.isGenerating !== true) {
      return;
    }
    const runId = typeof data.skillRunId === 'string' ? data.skillRunId : '';
    if (!runId) {
      return;
    }
    const resumeKey = `${projectId}:${canvasId}:${id}:${runId}`;
    if (resumeRunRef.current === resumeKey) {
      return;
    }
    resumeRunRef.current = resumeKey;
    let cancelled = false;
    const startedAt =
      typeof data.generationStartedAt === 'number' &&
      Number.isFinite(data.generationStartedAt)
        ? data.generationStartedAt
        : null;

    void (async () => {
      try {
        const taskKey =
          typeof data.generationTaskKey === 'string'
            ? data.generationTaskKey
            : '';
        if (taskKey) {
          await awaitCanvasGenerationTaskCompletion(taskKey, projectId);
        }
        const result = await awaitCanvasSkillRunResult({ projectId, runId });
        if (cancelled) {
          return;
        }
        if (isSkillRunFailureStatus(result.status)) {
          throw new Error(
            skillRunErrorMessage(result.error) ??
              `Skill run failed with status ${result.status}`,
          );
        }
        materializeOutputs(
          result.outputs ?? [],
          projectId,
          canvasId,
          runId,
          startedAt,
        );
        updateNodeData(id, {
          isGenerating: false,
          generationStartedAt: null,
          generationError: null,
          generationTaskKey: null,
          generationTaskType: null,
          generationTaskJobId: null,
        });
      } catch (error) {
        if (!cancelled) {
          updateNodeData(id, {
            isGenerating: false,
            generationStartedAt: null,
            generationError: skillNodeErrorMessage(error),
            generationTaskKey: null,
            generationTaskType: null,
            generationTaskJobId: null,
          });
        }
      } finally {
        if (resumeRunRef.current === resumeKey) {
          resumeRunRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    data.generationStartedAt,
    data.generationTaskKey,
    data.isGenerating,
    data.skillRunId,
    canvasId,
    id,
    projectId,
    skill,
    updateNodeData,
  ]);

  const handlePickFlatSource = async (
    kind: SkillCropSource['label'],
  ) => {
    const assets = await ensureSceneAssets(kind === 'director_background');
    const url =
      kind === 'master'
        ? assets?.master_url
        : kind === 'reverse'
          ? assets?.reverse_url
          : assets?.director_env_only_url;
    if (!url) {
      setSourcePickerError(
        kind === 'master'
          ? '当前场景没有 master 图'
          : kind === 'reverse'
            ? '当前场景没有 reverse 图'
            : '当前 Beat 还没有导演背景图',
      );
      return;
    }
    setCropSource({ url, label: kind });
  };

  const openContextDirectorWorld = async (
    destination: SkillDirectorWorldDestination,
  ) => {
    if (!beatTarget) {
      setSourcePickerError('缺少镜头上下文');
      return;
    }
    setSourcePickerBusy(true);
    setSourcePickerError(null);
    try {
      const assets = await ensureSceneAssets();
      const manifest = await getCanvasBeatDirectorManifest({
        projectId,
        episode: beatTarget.episode,
        beat: beatTarget.beat,
      });
      setDirectorStageManifest(
        mergeSkillManifestWithBeatContext(
          directorManifestWithScenePanoSource(manifest, assets),
          beatContextNode,
        ),
      );
      setDirectorWorldDestination(destination);
      setDirectorStageOpen(true);
    } catch (error) {
      setSourcePickerError(skillNodeErrorMessage(error));
    } finally {
      setSourcePickerBusy(false);
    }
  };

  const handleDirectorWorldOpenChange = (open: boolean) => {
    setDirectorStageOpen(open);
    if (!open) {
      setDirectorWorldDestination(null);
    }
  };

  const handleDirectorWorldCaptureSuccess = async (
    blob: Blob,
    meta?: SkillDirectorCaptureMeta,
  ) => {
    const destination = directorWorldDestination;
    if (!destination) {
      return;
    }
    try {
      if (destination === 'selected_background') {
        await uploadAndStageSelectedBackground(
          blob,
          `background_director_world_${Date.now()}.png`,
          t('viewer.threeD.selectedBackgroundOutputLabel', {
            episode: beatTarget?.episode ?? '',
            beat: beatTarget?.beat ?? '',
          }),
        );
      } else {
        await handleDirectorCombinedCaptureSuccess(blob, meta);
      }
      setSourcePickerError(null);
      setDirectorStageOpen(false);
    } catch (error) {
      setSourcePickerError(skillNodeErrorMessage(error));
      throw error;
    } finally {
      setDirectorWorldDestination(null);
    }
  };

  const handleSubmit = async () => {
    if (!skill || !ready || isBusy) {
      return;
    }

    if (submitInFlightRef.current) {
      return;
    }

    let startedAt = 0;
    let activeRunKey: string | null = null;
    try {
      const state = useCanvasStore.getState();
      const latestNodeById = new Map(
        state.nodes.map((node) => [node.id, node] as const),
      );
      const skillNode = latestNodeById.get(id);
      if (!skillNode) {
        throw new Error('Skill node no longer exists');
      }
      if (
        (skillNode.data as { isGenerating?: unknown }).isGenerating === true
      ) {
        return;
      }
      submitInFlightRef.current = true;
      setSubmitInFlight(true);
      const resolvedInputs = resolveInputsForSkill(
        skill,
        skillNode,
        state.edges.filter((edge) => edge.target === id),
        latestNodeById,
      );
      const currentParameters = normalizedSkillParameters(
        skill,
        (skillNode.data as SkillNodeData).parameters,
        dynamicParameterOptions,
      );
      const inputSignature = skillInputSignature({
        inputs: resolvedInputs,
        parameters: currentParameters,
      });
      const idempotencyKey = skillRunIdempotencyKey(
        canvasId,
        id,
        data.skill_id,
        inputSignature,
        createSkillRunNonce(),
      );
      startedAt = Date.now();
      updateNodeData(id, {
        isGenerating: true,
        generationStartedAt: startedAt,
        generationError: null,
        skillInputSignature: inputSignature,
        skillIdempotencyKey: idempotencyKey,
        skillRunId: null,
        generationTaskKey: null,
        generationTaskType: null,
        generationTaskJobId: null,
      });
      const response = await startCanvasSkillRun({
        projectId,
        skillId: data.skill_id,
        request: {
          skill_node_id: id,
          canvas_id: canvasId,
          idempotency_key: idempotencyKey,
          resolved_inputs: resolvedInputs,
          parameters: currentParameters,
        },
      });
      const runKey = `${projectId}:${canvasId}:${id}:${response.run_id}`;
      activeRunKey = runKey;
      resumeRunRef.current = runKey;
      updateNodeData(id, {
        isGenerating: true,
        skillRunId: response.run_id,
        generationTaskKey: response.task_key ?? null,
        generationTaskType: response.task_type ?? null,
        generationTaskJobId: response.job_id ?? null,
      });
      if (response.task_key) {
        setTaskRecordGraceUntil(Date.now() + SKILL_TASK_RECORD_GRACE_MS);
        setSubmitInFlight(false);
        submitInFlightRef.current = false;
        await awaitCanvasGenerationTaskCompletion(
          response.task_key,
          projectId,
        );
      }
      const result = await awaitCanvasSkillRunResult({
        projectId,
        runId: response.run_id,
      });
      if (isSkillRunFailureStatus(result.status)) {
        throw new Error(
          skillRunErrorMessage(result.error) ??
            `Skill run failed with status ${result.status}`,
        );
      }
      materializeOutputs(
        result.outputs ?? [],
        projectId,
        canvasId,
        response.run_id,
        startedAt,
      );
      updateNodeData(id, {
        isGenerating: false,
        generationStartedAt: null,
        generationError: null,
        generationTaskKey: null,
        generationTaskType: null,
        generationTaskJobId: null,
      });
      submitInFlightRef.current = false;
      setSubmitInFlight(false);
      setTaskRecordGraceUntil(0);
      if (resumeRunRef.current === runKey) {
        resumeRunRef.current = null;
      }
    } catch (error) {
      submitInFlightRef.current = false;
      setSubmitInFlight(false);
      setTaskRecordGraceUntil(0);
      if (activeRunKey && resumeRunRef.current === activeRunKey) {
        resumeRunRef.current = null;
      }
      const currentNode = useCanvasStore
        .getState()
        .nodes.find((node) => node.id === id);
      const currentStartedAt = (
        currentNode?.data as { generationStartedAt?: unknown } | undefined
      )?.generationStartedAt;
      if (currentNode && (currentStartedAt === startedAt || !activeRunKey)) {
        updateNodeData(id, {
          isGenerating: false,
          generationStartedAt: null,
          generationError: skillNodeErrorMessage(error),
          generationTaskKey: null,
          generationTaskType: null,
          generationTaskJobId: null,
        });
      }
    }
  };

  return {
    id,
    data,
    resolvedWidth,
    skill,
    imageModels,
    parameterEntries,
    skillParameters,
    incomingEdges,
    nodeById,
    beatContextReferences,
    inputHandleIds,
    referenceInputHandlesByRole,
    outputHandleIds,
    beatTarget,
    ready,
    isBusy,
    submitLabel,
    isLoading,
    loadError,
    localizedSkillName,
    localizedSkillDescription,
    mainlineManaged,
    isSetSelectedBackgroundSkill,
    isSetDirectorCombinedSkill,
    directorEnvOnlyPreviewUrl,
    sourcePickerBusy,
    sourcePickerError,
    cropSource,
    directorStageOpen,
    directorStageManifest,
    directorWorldDestination,
    selectNode: () => setSelectedNode(id),
    changeParameter: handleParameterChange,
    pickFlatSource: handlePickFlatSource,
    openContextDirectorWorld,
    submit: handleSubmit,
    closeCropSource: () => setCropSource(null),
    uploadAndStageSelectedBackground,
    clearSourcePickerError: () => setSourcePickerError(null),
    setSourcePickerError,
    changeDirectorWorldOpen: handleDirectorWorldOpenChange,
    captureDirectorWorld: handleDirectorWorldCaptureSuccess,
  };
}

export type SkillNodeController = ReturnType<typeof useSkillNodeController>;
