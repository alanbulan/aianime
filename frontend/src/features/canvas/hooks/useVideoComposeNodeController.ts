// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import type { ComposeTimelineState } from '@/features/canvas/compose/timelineModel';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
  type VideoComposeNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import {
  MIN_VIDEO_COMPOSE_VIDEOS,
  projectVideoComposeInputs,
} from '@/features/canvas/domain/videoComposeInputs';
import { useUpstreamNodes } from '@/features/canvas/hooks/useUpstreamGraph';
import { readUrl } from '@/lib/url-params';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;

export interface VideoComposeNodeControllerOptions {
  id: string;
  data: VideoComposeNodeData;
  selected?: boolean;
}

export function useVideoComposeNodeController({
  id,
  data,
  selected,
}: VideoComposeNodeControllerOptions) {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const upstreamNodes = useUpstreamNodes(id);
  const [isEditorOpen, setEditorOpen] = useState(false);
  const inputProjection = useMemo(
    () => projectVideoComposeInputs(upstreamNodes),
    [upstreamNodes],
  );
  const title = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.videoCompose, data),
    [data],
  );
  const location = readUrl();
  const project = location.project;
  const canvasId = location.canvas ?? 'default';

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  const openEditor = () => {
    if (inputProjection.canOpen && project) {
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
    videoCount: inputProjection.videoCount,
    canOpen: inputProjection.canOpen,
    isEditorOpen,
    project,
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
