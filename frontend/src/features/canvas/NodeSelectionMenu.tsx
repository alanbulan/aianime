// Copyright (c) 2026 AI anime
import { createElement } from 'react';

import {
  useNodeSelectionMenuController,
  type NodeSelectionMenuControllerOptions,
} from './hooks/useNodeSelectionMenuController';
import { NodeSelectionMenuView } from './ui/NodeSelectionMenuView';

export function NodeSelectionMenu(
  props: NodeSelectionMenuControllerOptions,
) {
  const controller = useNodeSelectionMenuController(props);
  return createElement(NodeSelectionMenuView, { controller });
}
