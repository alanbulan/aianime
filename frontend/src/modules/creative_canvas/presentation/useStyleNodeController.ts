// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  StyleNodeData,
} from '../domain/canvasNodeData';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import { isImageGenNode } from '../domain/canvasNodePredicates';
import {
  DEFAULT_NODE_DISPLAY_NAME,
  resolveNodeDisplayName,
} from '../domain/nodeDisplay';
import type { UseCanvasStyleTemplatesResult } from './useCanvasStyleTemplates';
import { describeStyleSelection } from './StylePickerPopover';

export type StyleSelectionState =
  | 'none'
  | 'ready'
  | 'loading'
  | 'failed'
  | 'missing';

export interface StyleNodeStore {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
}

export type StyleNodeStoreHook = <TSelected>(
  selector: (state: StyleNodeStore) => TSelected,
) => TSelected;

export interface StyleNodeControllerOptions {
  id: string;
  data: StyleNodeData;
  selected?: boolean;
  projectId: string;
}

export function createUseStyleNodeController({
  useStore,
  useCanvasStyleTemplates,
}: {
  useStore: StyleNodeStoreHook;
  useCanvasStyleTemplates: (
    projectId: string,
  ) => UseCanvasStyleTemplatesResult;
}) {
  return function useStyleNodeController({
    id,
    data,
    selected,
    projectId,
  }: StyleNodeControllerOptions) {
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const updateNodeData = useStore((state) => state.updateNodeData);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const {
      templates,
      isLoading,
      error,
      retry,
    } = useCanvasStyleTemplates(projectId);

    const templateId =
      typeof data.styleTemplateId === 'string'
      && data.styleTemplateId.length > 0
        ? data.styleTemplateId
        : null;
    const template = describeStyleSelection(templateId, templates);
    const selectionState: StyleSelectionState = (() => {
      if (!templateId) return 'none';
      if (template) return 'ready';
      if (isLoading) return 'loading';
      if (error) return 'failed';
      return 'missing';
    })();

    const downstreamImageNodeIds = useStore(
      useShallow((state) => {
        const targetIds = new Set(
          state.edges
            .filter((edge) => edge.source === id)
            .map((edge) => edge.target),
        );
        return state.nodes
          .filter((node) => targetIds.has(node.id) && isImageGenNode(node))
          .map((node) => node.id);
      }),
    );
    const isOrphan = downstreamImageNodeIds.length === 0;

    const resolvedTitle = useMemo(() => {
      const customTitle =
        typeof data.displayName === 'string' ? data.displayName.trim() : '';
      if (customTitle) return customTitle;
      if (!template) {
        return resolveNodeDisplayName(CANVAS_NODE_TYPES.style, data);
      }
      return [
        DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.style],
        template.category,
        template.label,
      ]
        .filter(
          (part) => typeof part === 'string' && part.trim().length > 0,
        )
        .join(' · ');
    }, [data, template]);

    const openGallery = useCallback(() => {
      if (isOrphan) return;
      retry();
      setGalleryOpen(true);
    }, [isOrphan, retry]);

    const handleSelectStyle = useCallback(
      (nextId: string | null) => {
        downstreamImageNodeIds.forEach((imageNodeId) => {
          updateNodeData(imageNodeId, { styleTemplateId: nextId });
        });
        setGalleryOpen(false);
      },
      [downstreamImageNodeIds, updateNodeData],
    );

    return {
      id,
      selected,
      projectId,
      templateId,
      template,
      selectionState,
      resolvedTitle,
      isOrphan,
      galleryOpen,
      setGalleryOpen,
      openGallery,
      handleSelectStyle,
      setSelectedNode,
      updateNodeData,
    };
  };
}

export type StyleNodeController = ReturnType<
  ReturnType<typeof createUseStyleNodeController>
>;
