// Copyright (c) 2026 AI anime
import { createElement } from 'react';

import {
  type NodeSelectionMenuNodeDefinition,
} from './CanvasNodeMenuPrimitives';
import { NodeSelectionMenuView } from './NodeSelectionMenuView';
import {
  useNodeSelectionMenuController,
  type NodeSelectionMenuControllerOptions,
} from './useNodeSelectionMenuController';

export interface NodeSelectionMenuProps<TNodeType extends string = string>
  extends NodeSelectionMenuControllerOptions<TNodeType> {
  nodeDefinitions: readonly NodeSelectionMenuNodeDefinition<TNodeType>[];
}

export function NodeSelectionMenu<TNodeType extends string>({
  nodeDefinitions,
  ...controllerOptions
}: NodeSelectionMenuProps<TNodeType>) {
  const controller = useNodeSelectionMenuController(controllerOptions);
  return createElement(NodeSelectionMenuView<TNodeType>, {
    controller,
    nodeDefinitions,
  });
}
