// Copyright (c) 2026 AI anime
import type { NodeToolType } from './canvasNodeTool';
import type { CanvasNodeImageSourceLike } from './canvasNodeImageSource';
import { builtInToolPlugins } from './canvasToolCatalog';
import type { CanvasToolPlugin } from './canvasTool';

const toolRegistry = new Map<NodeToolType, CanvasToolPlugin>(
  builtInToolPlugins.map((plugin) => [plugin.type, plugin])
);

export function getToolPlugin(toolType: NodeToolType): CanvasToolPlugin | null {
  return toolRegistry.get(toolType) ?? null;
}

export function getNodeToolPlugins(
  node: CanvasNodeImageSourceLike,
): CanvasToolPlugin[] {
  return builtInToolPlugins.filter((plugin) => plugin.supportsNode(node));
}
