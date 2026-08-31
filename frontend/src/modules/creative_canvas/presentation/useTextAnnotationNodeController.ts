// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  TextAnnotationNodeData,
  UploadImageNodeData,
  VideoNodeData,
} from '../domain/canvasNodeData';
import { resolveImageDisplayUrl } from '../domain/imageData';
import {
  DEFAULT_SHARED_MODEL_ID,
} from '../domain/modelDefaults';
import { isSystemManagedNodeData } from '../domain/mainlineNodeFlags';
import { resolveNodeDisplayName } from '../domain/nodeDisplay';
import {
  TEXT_ANNOTATION_IMAGE_TO_PROMPT_DEFAULT_CONTENT,
  TEXT_ANNOTATION_MUSIC_DEFAULT_CONTENT,
  TEXT_ANNOTATION_NODE_SIZE,
  TEXT_ANNOTATION_REVERSE_PROMPT_DURATION_MS,
  hasTextAnnotationUserContent,
  isCompactTextAnnotationView,
  resolveTextAnnotationMode,
  resolveTextAnnotationNodeSize,
  resolveTextAnnotationUpstreamImageUrl,
  type TextNodeMode,
} from '../domain/textAnnotationNodeModel';
import {
  normalizeVideoDuration,
  normalizeVideoOutput,
  videoDurationDefinitionForModel,
  videoExtraParamsForModel,
  videoOutputDefinitionForModel,
  videoOutputForAspectRatio,
  videoSupportsGenerateAudio,
  type VideoGenCount,
} from '../domain/videoGenerationModel';
import type { CanvasVideoModel } from '../application/generationCatalog';
import { resolveGenerationOutputUrl } from '../application/generationOutputUrl';
import { generationTaskDescriptor } from '../application/resumeGeneration';
import type {
  CanvasGenerationTaskRef,
} from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasReversePromptParams,
} from '../application/generateCanvasReversePrompt';
import type {
  SubmitVideoGenerationParams,
  VideoGenerationAspectRatio,
} from '../application/submitVideoGeneration';
import type {
  TranslateCanvasTextParams,
  TranslateCanvasTextResult,
} from '../application/translateCanvasText';
import { useNodeGenerationTaskState } from './useNodeGenerationTaskState';


const SPAWN_UPLOAD_WIDTH = 320;
const EDIT_VIEW_ZOOM = 1.4;

export interface TextAnnotationNodeStore {
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  deleteEdge: (edgeId: string) => void;
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  addEdge: (source: string, target: string) => string | null;
  duplicateNodeAsSibling: (
    sourceNodeId: string,
    index: number,
    dataOverrides?: Partial<CanvasNodeData>,
  ) => string | null;
  findNodePosition: (
    sourceNodeId: string,
    width: number,
    height: number,
  ) => { x: number; y: number };
  autoGroupSpawn: (
    sourceNodeId: string,
    spawnedNodeIds: string[],
    options?: { label?: string },
  ) => string | null;
  edges: readonly CanvasEdge[];
  nodes: readonly CanvasNode[];
}

export type TextAnnotationNodeStoreHook = {
  <TSelected>(
    selector: (state: TextAnnotationNodeStore) => TSelected,
  ): TSelected;
  getState: () => TextAnnotationNodeStore;
};

export type TextAnnotationIsBoxSelecting = () => boolean;

export type TextAnnotationGenerateReversePrompt = (
  params: GenerateCanvasReversePromptParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<{ task: CanvasGenerationTaskRef; prompt: string }>;

export type TextAnnotationSubmitVideoGeneration = (
  params: SubmitVideoGenerationParams,
) => Promise<CanvasGenerationTaskRef>;

export type TextAnnotationCanvasVideoModelsHook = (
  projectId: string,
) => { models: CanvasVideoModel[] };

export type TextAnnotationAwaitCompletion = (
  taskKey: string,
  projectId: string,
) => Promise<{ result?: unknown | null }>;

export type TextAnnotationTranslateText = (
  params: Omit<TranslateCanvasTextParams, "model"> & { model?: string },
) => Promise<TranslateCanvasTextResult>;

export interface TextAnnotationNodeControllerOptions {
  id: string;
  data: TextAnnotationNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
  projectId: string;
  canvasId: string;
}

export function createUseTextAnnotationNodeController({
  useStore,
  useIsBoxSelecting,
  generateCanvasReversePrompt,
  submitVideoGeneration,
  useCanvasVideoModels,
  awaitCanvasGenerationTaskCompletion,
  translateCanvasText,
}: {
  useStore: TextAnnotationNodeStoreHook;
  useIsBoxSelecting: TextAnnotationIsBoxSelecting;
  generateCanvasReversePrompt: TextAnnotationGenerateReversePrompt;
  submitVideoGeneration: TextAnnotationSubmitVideoGeneration;
  useCanvasVideoModels: TextAnnotationCanvasVideoModelsHook;
  awaitCanvasGenerationTaskCompletion: TextAnnotationAwaitCompletion;
  translateCanvasText: TextAnnotationTranslateText;
}) {
  return function useTextAnnotationNodeController({
    id,
    data,
    selected,
    width,
    height,
    projectId,
    canvasId,
  }: TextAnnotationNodeControllerOptions) {
    const { t } = useTranslation();
    const reactFlow = useReactFlow();
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const updateNodeData = useStore((state) => state.updateNodeData);
    const deleteEdge = useStore((state) => state.deleteEdge);
    const addNode = useStore((state) => state.addNode);
    const addEdge = useStore((state) => state.addEdge);
    const duplicateNodeAsSibling = useStore(
      (state) => state.duplicateNodeAsSibling,
    );
    const findNodePosition = useStore((state) => state.findNodePosition);
    const isBoxSelecting = useIsBoxSelecting();
    const content = typeof data.content === 'string' ? data.content : '';
    const instruction =
      typeof data.instruction === 'string' ? data.instruction : '';
    const mode = resolveTextAnnotationMode(data.mode);
    const pickerDismissed = Boolean(data.pickerDismissed);
    const modelId =
      typeof data.model === 'string' && data.model.length > 0
        ? data.model
        : DEFAULT_SHARED_MODEL_ID;
    const { models: videoModels } = useCanvasVideoModels(projectId);
    const { isGenerating, progress: generationProgress } =
      useNodeGenerationTaskState(data);
    const isReferenceOnly = Boolean(data.referenceOnly);
    const isSystemManaged = isSystemManagedNodeData(data);
    const isCompactView = isCompactTextAnnotationView(
      mode,
      isReferenceOnly,
    );
    const size = resolveTextAnnotationNodeSize({
      width,
      height,
      compact: isCompactView,
    });
    const title = resolveNodeDisplayName(CANVAS_NODE_TYPES.textAnnotation, data);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    const upstreamImageUrl = useStore((state) => {
      const edge = state.edges.find((candidate) => candidate.target === id);
      if (!edge) {
        return null;
      }
      const node = state.nodes.find((candidate) => candidate.id === edge.source);
      return resolveTextAnnotationUpstreamImageUrl(node?.data);
    });
    const upstreamImageDisplayUrl = upstreamImageUrl
      ? resolveImageDisplayUrl(upstreamImageUrl)
      : null;

    const detachUpstreamImage = useCallback(() => {
      const state = useStore.getState();
      const edge = state.edges.find((candidate) => candidate.target === id);
      if (edge) {
        deleteEdge(edge.id);
      }
    }, [deleteEdge, id]);

    const enterEditMode = useCallback(() => {
      if (isSystemManaged) {
        return;
      }
      const node = reactFlow.getNode(id);
      if (node) {
        const nodeWidth =
          node.measured?.width ??
          width ??
          TEXT_ANNOTATION_NODE_SIZE.defaultWidth;
        const nodeHeight =
          node.measured?.height ??
          height ??
          TEXT_ANNOTATION_NODE_SIZE.defaultHeight;
        const absolute =
          reactFlow.getInternalNode(id)?.internals.positionAbsolute ??
          node.position;
        void reactFlow.setCenter(
          absolute.x + nodeWidth / 2,
          absolute.y + nodeHeight / 2,
          { zoom: EDIT_VIEW_ZOOM, duration: 280 },
        );
      }
      setIsEditingContent(true);
    }, [height, id, isSystemManaged, reactFlow, width]);

    useEffect(() => {
      if (isSystemManaged && isEditingContent) {
        setIsEditingContent(false);
      }
    }, [isEditingContent, isSystemManaged]);

    useEffect(() => {
      if (!isEditingContent) {
        return;
      }
      const timer = window.setTimeout(() => {
        editTextareaRef.current?.focus();
        const length = editTextareaRef.current?.value.length ?? 0;
        editTextareaRef.current?.setSelectionRange(length, length);
      }, 0);
      return () => window.clearTimeout(timer);
    }, [isEditingContent]);

    const spawnVideoNode = useCallback(() => {
      const position = findNodePosition(id, 580, 680);
      const seedData: Partial<VideoNodeData> = {
        genMode: 'textToVideo',
        prompt: typeof data.content === 'string' ? data.content : '',
      };
      const newNodeId = addNode(CANVAS_NODE_TYPES.video, position, seedData);
      addEdge(id, newNodeId);
      useStore.getState().autoGroupSpawn(id, [newNodeId], {
        label: '文生视频组',
      });
    }, [addEdge, addNode, data.content, findNodePosition, id]);

    const spawnUploadNode = useCallback(() => {
      const sourceNode = useStore
        .getState()
        .nodes.find((node) => node.id === id);
      const position = {
        x: (sourceNode?.position.x ?? 0) - SPAWN_UPLOAD_WIDTH - 60,
        y: sourceNode?.position.y ?? 0,
      };
      const seedData: Partial<UploadImageNodeData> = { imageOnly: true };
      const newNodeId = addNode(CANVAS_NODE_TYPES.upload, position, seedData);
      addEdge(newNodeId, id);
      useStore.getState().autoGroupSpawn(id, [newNodeId], {
        label: '图片反推提示词组',
      });
    }, [addEdge, addNode, id]);

    const spawnAudioNode = useCallback(
      (audioKind: 'speech' | 'music') => {
        const position = findNodePosition(id, 480, 180);
        const newNodeId = addNode(CANVAS_NODE_TYPES.audio, position, {
          audioKind,
        });
        addEdge(id, newNodeId);
        useStore.getState().autoGroupSpawn(id, [newNodeId], {
          label:
            audioKind === 'music' ? '文字生成音乐组' : '克隆音频组',
        });
      },
      [addEdge, addNode, findNodePosition, id],
    );

    const selectMode = useCallback(
      (nextMode: TextNodeMode) => {
        if (nextMode === 'writing') {
          updateNodeData(id, { mode: nextMode });
          enterEditMode();
          return;
        }
        if (nextMode === 'textToMusicGen') {
          spawnAudioNode('music');
          updateNodeData(id, {
            mode: 'writing',
            pickerDismissed: true,
            content: TEXT_ANNOTATION_MUSIC_DEFAULT_CONTENT,
          });
          enterEditMode();
          return;
        }
        updateNodeData(id, { mode: nextMode });
        if (nextMode === 'textToVideo') {
          spawnVideoNode();
        } else if (nextMode === 'imageToPrompt') {
          spawnUploadNode();
        } else if (nextMode === 'textToMusic') {
          spawnAudioNode('speech');
        }
      },
      [
        enterEditMode,
        id,
        spawnAudioNode,
        spawnUploadNode,
        spawnVideoNode,
        updateNodeData,
      ],
    );

    const runImageToPrompt = useCallback(async () => {
      if (!projectId) {
        console.error('[text-node] missing project context');
        return;
      }
      const state = useStore.getState();
      const upstreamEdge = state.edges.find((edge) => edge.target === id);
      const sourceNode = upstreamEdge
        ? state.nodes.find((node) => node.id === upstreamEdge.source)
        : null;
      const rawUrl = resolveTextAnnotationUpstreamImageUrl(sourceNode?.data);
      if (!rawUrl) {
        console.warn('[text-node] imageToPrompt: no upstream image url');
        return;
      }
      updateNodeData(id, {
        isGenerating: true,
        generationStartedAt: Date.now(),
      });
      try {
        const result = await generateCanvasReversePrompt(
          {
            projectId,
            rawSourceUrl: rawUrl,
            canvasId,
            nodeId: id,
          },
          (task) => updateNodeData(id, generationTaskDescriptor(task)),
        );
        if (result.prompt && result.prompt.trim().length > 0) {
          updateNodeData(id, {
            content: result.prompt,
            isGenerating: false,
            generationStartedAt: null,
          });
        } else {
          console.warn('[text-node] reverse-prompt returned empty prompt', {
            jobId: result.task.job_id,
          });
          updateNodeData(id, {
            isGenerating: false,
            generationStartedAt: null,
          });
        }
      } catch (error) {
        console.error('[text-node] reverse-prompt failed', error);
        updateNodeData(id, {
          isGenerating: false,
          generationStartedAt: null,
        });
      }
    }, [canvasId, id, projectId, updateNodeData]);

    const runTextToVideo = useCallback(async () => {
      const promptText = content.trim();
      if (promptText.length === 0) {
        return;
      }
      if (!projectId) {
        console.error('[text-node] missing project context');
        return;
      }
      const state = useStore.getState();
      const downstreamEdge = state.edges.find((edge) => edge.source === id);
      const targetNode = downstreamEdge
        ? state.nodes.find((node) => node.id === downstreamEdge.target)
        : null;
      if (!targetNode || targetNode.type !== CANVAS_NODE_TYPES.video) {
        console.warn('[text-node] textToVideo: no downstream video node');
        return;
      }
      const videoData = targetNode.data as VideoNodeData;
      const count = (videoData.count ?? 1) as VideoGenCount;
      const selectedVideoModel =
        (typeof videoData.model === 'string' && videoData.model.length > 0
          ? videoModels.find((model) => model.id === videoData.model)
          : undefined) ?? videoModels[0];
      const outputDefinition = videoOutputDefinitionForModel(selectedVideoModel);
      const aspectRatioOptions = selectedVideoModel?.aspectRatioOptions ?? [];
      const aspectRatio = aspectRatioOptions.includes(videoData.aspectRatio)
        ? videoData.aspectRatio
        : aspectRatioOptions[0];
      const durationDefinition = videoDurationDefinitionForModel(
        selectedVideoModel,
      );
      if (!selectedVideoModel || !outputDefinition || !aspectRatio || !durationDefinition) {
        console.error('[text-node] video model catalog parameters are incomplete');
        return;
      }
      const outputValue = normalizeVideoOutput(
        videoData.generationResolution ??
          videoOutputForAspectRatio(
            outputDefinition,
            aspectRatio,
            outputDefinition.defaultValue,
          ),
        outputDefinition,
      );
      if (!outputValue) return;
      const durationSec = normalizeVideoDuration(
        typeof videoData.durationSec === 'number'
          ? videoData.durationSec
          : durationDefinition.defaultValue,
        durationDefinition,
      );
      const generateAudio =
        videoSupportsGenerateAudio(selectedVideoModel) &&
        Boolean(videoData.generateAudio);
      const extraParams = videoExtraParamsForModel(
        selectedVideoModel,
        videoData.extraParams,
      );
      const total = Math.min(Math.max(count, 1), 4);

      updateNodeData(targetNode.id, {
        prompt: promptText,
        isGenerating: true,
        generationStartedAt: Date.now(),
        generationBatch: null,
      });
      const targetIds = [targetNode.id];
      for (let index = 1; index < total; index += 1) {
        const siblingId = duplicateNodeAsSibling(targetNode.id, index, {
          prompt: promptText,
          isGenerating: true,
          generationStartedAt: Date.now(),
          count: 1,
          videoUrl: null,
          sourceFileName: null,
          generationBatch: null,
        });
        if (siblingId) {
          targetIds.push(siblingId);
        }
      }

      const runOne = async (videoNodeId: string) => {
        try {
          const reference = await submitVideoGeneration({
            kind: 'text',
            projectId,
            prompt: promptText,
            cameraTemplateId: null,
            aspectRatio: aspectRatio as VideoGenerationAspectRatio,
            output: {
              parameter: outputDefinition.parameter,
              value: outputValue,
            },
            extraParams,
            durationSeconds: durationSec,
            generateAudio,
            model: selectedVideoModel.apiModel,
            modelSelector: selectedVideoModel.routeSelector,
            genMode: 'textToVideo',
            humanReview: false,
            sceneOptimize: null,
            canvasId,
            nodeId: videoNodeId,
          });
          updateNodeData(videoNodeId, generationTaskDescriptor(reference));
          const completed = await awaitCanvasGenerationTaskCompletion(
            reference.task_key,
            projectId,
          );
          const url = resolveGenerationOutputUrl(completed.result, 'video');
          if (url) {
            updateNodeData(videoNodeId, {
              videoUrl: url,
              isGenerating: false,
              generationStartedAt: null,
              sourceFileName: null,
            });
          } else {
            console.warn(
              '[text-node] textToVideo completed without output url',
              completed,
            );
            updateNodeData(videoNodeId, {
              isGenerating: false,
              generationStartedAt: null,
            });
          }
        } catch (error) {
          console.error('[text-node] textToVideo failed', error);
          updateNodeData(videoNodeId, {
            isGenerating: false,
            generationStartedAt: null,
          });
        }
      };

      await Promise.allSettled(targetIds.map(runOne));
    }, [
      canvasId,
      content,
      duplicateNodeAsSibling,
      id,
      projectId,
      updateNodeData,
      videoModels,
    ]);

    const textPlaceholder = t('node.textNode.placeholder');
    const hasUserContent = hasTextAnnotationUserContent(
      content,
      textPlaceholder,
    );
    const submitDisabled =
      isGenerating || (mode !== 'imageToPrompt' && !hasUserContent);

    const submit = useCallback(() => {
      if (isGenerating) {
        return;
      }
      if (mode === 'imageToPrompt') {
        void runImageToPrompt();
        return;
      }
      if (mode === 'textToVideo') {
        void runTextToVideo();
      }
    }, [
      isGenerating,
      mode,
      runImageToPrompt,
      runTextToVideo,
    ]);

    const translate = useCallback(async () => {
      if (isGenerating || isTranslating) {
        return;
      }
      if (content.trim().length === 0) {
        return;
      }
      if (!projectId) {
        console.error('[text-node] translate: missing project context');
        return;
      }
      setIsTranslating(true);
      try {
        const result = await translateCanvasText({
          projectId,
          text: content,
          nodeType: 'text',
          canvasId,
          nodeId: id,
        });
        updateNodeData(id, { content: result.translatedText });
      } catch (error) {
        console.error('[text-node] translate failed', error);
      } finally {
        setIsTranslating(false);
      }
    }, [
      canvasId,
      content,
      id,
      isGenerating,
      isTranslating,
      projectId,
      updateNodeData,
    ]);

    return {
      id,
      projectId,
      data,
      selected,
      content,
      mode,
      pickerDismissed,
      modelId,
      title,
      size,
      isGenerating,
      generationProgress,
      isSystemManaged,
      isCompactView,
      isEditingContent,
      isTranslating,
      editTextareaRef,
      upstreamImageDisplayUrl,
      textPlaceholder,
      hasUserContent,
      submitDisabled,
      reversePromptDurationMs: TEXT_ANNOTATION_REVERSE_PROMPT_DURATION_MS,
      compactInputValue:
        mode === 'imageToPrompt' &&
        instruction === TEXT_ANNOTATION_IMAGE_TO_PROMPT_DEFAULT_CONTENT
          ? ''
          : mode === 'imageToPrompt'
            ? instruction
            : content,
      compactInputPlaceholder:
        mode === 'imageToPrompt'
          ? TEXT_ANNOTATION_IMAGE_TO_PROMPT_DEFAULT_CONTENT
          : textPlaceholder,
      showWritingOpsPanel:
        !isCompactView &&
        Boolean(selected) &&
        !isBoxSelecting &&
        !isReferenceOnly &&
        !isSystemManaged &&
        !isEditingContent,
      showCompactOpsPanel:
        Boolean(selected) &&
        !isBoxSelecting &&
        !isReferenceOnly &&
        !isSystemManaged &&
        !isEditingContent,
      translateDisabled:
        isGenerating || isTranslating || content.trim().length === 0,
      select: () => setSelectedNode(id),
      rename: (displayName: string) => updateNodeData(id, { displayName }),
      changeContent: (nextContent: string) =>
        updateNodeData(id, { content: nextContent }),
      changeCompactInput: (value: string) =>
        updateNodeData(id, {
          [mode === 'imageToPrompt' ? 'instruction' : 'content']: value,
        }),
      changeModel: (model: string) => updateNodeData(id, { model }),
      detachUpstreamImage,
      enterEditMode,
      finishEditing: () => setIsEditingContent(false),
      cancelEditing: () => {
        setIsEditingContent(false);
        editTextareaRef.current?.blur();
      },
      selectMode,
      submit,
      translate,
    };
  };
}

export type TextAnnotationNodeController = ReturnType<
  ReturnType<typeof createUseTextAnnotationNodeController>
>;
