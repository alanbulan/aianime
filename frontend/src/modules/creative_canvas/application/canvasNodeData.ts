// Copyright (c) 2026 AI anime
export interface CanvasNodeDataNode<TNodeData extends object> {
  id: string;
  data: TNodeData;
}

export interface CanvasNodeDataUpdateResult<TNode> {
  nodes: TNode[];
  changed: boolean;
}

export interface CanvasNodeDataUpdatePorts<
  TNode,
  TNodeData extends object,
> {
  applyMergedNodeData: (
    node: TNode,
    mergedData: TNodeData,
    patch: Partial<TNodeData>,
  ) => TNode;
}

export function cloneCanvasNodeData<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function updateCanvasNodeData<
  TNodeData extends object,
  TNode extends CanvasNodeDataNode<TNodeData>,
>(
  nodes: TNode[],
  nodeId: string,
  patch: Partial<TNodeData>,
  ports: CanvasNodeDataUpdatePorts<TNode, TNodeData>,
): CanvasNodeDataUpdateResult<TNode> {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    const hasDataChange = Object.entries(patch).some(([key, nextValue]) =>
      !Object.is(Reflect.get(node.data, key), nextValue));
    if (!hasDataChange) {
      return node;
    }

    const mergedData = {
      ...node.data,
      ...patch,
    };
    changed = true;
    return ports.applyMergedNodeData(node, mergedData, patch);
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}
