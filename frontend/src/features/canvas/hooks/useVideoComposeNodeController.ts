// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import {
  MIN_VIDEO_COMPOSE_VIDEOS,
  projectVideoComposeInputs,
  type ComposeTimelineState,
  type VideoComposeInputMedia,
} from '@/modules/creative_canvas/public';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  CANVAS_NODE_TYPES,
  isAudioNode,
  isVideoNode,
  type CanvasNode,
  type CanvasNodeData,
  type VideoComposeNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/modules/creative_canvas/public';
import { useUpstreamNodes } from '@/features/canvas/hooks/useUpstreamGraph';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;

function mapCanvasVideoComposeInputs(
  nodes: readonly CanvasNode[],
): VideoComposeInputMedia[] {
  return nodes.flatMap<VideoComposeInputMedia>((node) => {
    if (isVideoNode(node) && node.data.videoUrl) {
      return [{
        nodeId: node.id,
        kind: 'video',
        sourceUrl: node.data.videoUrl,
        displayName: node.data.displayName ?? null,
        thumbUrl: node.data.previewImageUrl ?? null,
        durationMs:
          typeof node.data.durationMs === 'number' ? node.data.durationMs : null,
        verticalPosition: node.position?.y ?? 0,
      }];
    }
    if (isAudioNode(node) && node.data.audioUrl) {
      return [{
        nodeId: node.id,
        kind: 'audio',
        sourceUrl: node.data.audioUrl,
        displayName: node.data.displayName ?? null,
        thumbUrl: null,
        durationMs:
          typeof node.data.durationMs === 'number' ? node.data.durationMs : null,
        verticalPosition: node.position?.y ?? 0,
      }];
    }
    return [];
  });
}

export interface VideoComposeNodeControllerOptions {
  id: string;
  data: VideoComposeNodeData;
  projectId: string;
  canvasId: string;
  selected?: boolean;
}

export function useVideoComposeNodeController({
  id,
  data,
  projectId,
  canvasId,
  selected,
}: VideoComposeNodeControllerOptions) {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const upstreamNodes = useUpstreamNodes(id);
  const [isEditorOpen, setEditorOpen] = useState(false);
  const inputProjection = useMemo(
    () => projectVideoComposeInputs(mapCanvasVideoComposeInputs(upstreamNodes)),
    [upstreamNodes],
  );
  const title = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.videoCompose, data),
    [data],
  );
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  const openEditor = () => {
    if (inputProjection.canOpen) {
      setEditorOpen(true);
    }
  };
  const closeEditor = () => setEditorOpen(false);
  const persistDraft = (timeline: ComposeTimelineState) => {
    updateNodeData(id, { draftTimeline: timeline });
  };
  const completeComposition = (url: string, coverUrl: string | null) => {
    const store = useCanvasStore.getState();
    const position = store.findNodePosition(id, 580, 380);
    const newId = store.addNode(CANVAS_NODE_TYPES.video, position, {
      videoUrl: url,
      previewImageUrl: coverUrl,
      displayName: t('videoCompose.node.resultName'),
      sourceFileName: null,
    } as Partial<CanvasNodeData>);
    store.addEdge(id, newId);
    store.setSelectedNode(newId);
    store.requestFocusNode(newId);
    updateNodeData(id, {
      resultVideoUrl: url,
      previewImageUrl: coverUrl,
    });
    setEditorOpen(false);
  };

  return {
    id,
    data,
    selected,
    title,
    size: { width: NODE_WIDTH, height: NODE_HEIGHT },
    seedNodeIds: inputProjection.seedNodeIds,
    sourceMedia: inputProjection.sourceMedia,
    videoCount: inputProjection.videoCount,
    canOpen: inputProjection.canOpen,
    isEditorOpen,
    project: projectId,
    canvasId,
    initialTimeline:
      (data.draftTimeline as ComposeTimelineState | undefined) ?? null,
    openLabel: t('videoCompose.node.open'),
    hintText: t('videoCompose.node.hint', {
      min: MIN_VIDEO_COMPOSE_VIDEOS,
    }),
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    openEditor,
    closeEditor,
    persistDraft,
    completeComposition,
  };
}

export type VideoComposeNodeController = ReturnType<
  typeof useVideoComposeNodeController
>;
