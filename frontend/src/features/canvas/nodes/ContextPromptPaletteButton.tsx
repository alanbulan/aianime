// Copyright (c) 2026 AI anime
import { useMemo } from "react";

import {
  ContextPromptPaletteButton,
  buildContextPromptPaletteForNode,
  type ContextPromptPaletteEntry,
} from "@/modules/creative_canvas/public";


import { useCanvasStore } from "@/modules/creative_canvas/public";
/**
 * 节点用的调色盘按钮：把「订阅全量 nodes/edges 构建 palette」的逻辑下沉到这个叶子
 * 组件，宿主节点（VideoNode / ImageGenNode 等重组件）就不必为了调色盘订阅整图、
 * 从而避免任意节点拖动都重渲染整个宿主节点——只让这个小按钮重渲染。
 */
export function NodeContextPromptPaletteButton({
  nodeId,
  onInsert,
}: {
  nodeId: string;
  onInsert: (entry: ContextPromptPaletteEntry) => void;
}) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const palette = useMemo(
    () => buildContextPromptPaletteForNode(nodes, edges, nodeId),
    [nodes, edges, nodeId],
  );
  return <ContextPromptPaletteButton palette={palette} onInsert={onInsert} />;
}
