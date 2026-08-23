// Copyright (c) 2026 AI anime

/**
 * 图片节点的 styleTemplateId 是唯一真源，风格节点只是它在画布上的投影。
 * 纯函数负责处理新增节点尚未回流、存量画布补建和用户删除投影等时序。
 */
export interface StyleNodeSnapshot {
  id: string;
  templateId: string | null;
  sharedWithOtherTargets: boolean;
}

export interface StyleNodeSyncInput {
  selectedTemplateId: string | null;
  styleNode: StyleNodeSnapshot | null;
  lastSyncedTemplateId: string | null | undefined;
  everObservedStyleNode: boolean;
}

export type StyleNodeSyncAction =
  | { kind: 'none' }
  | { kind: 'create'; templateId: string }
  | { kind: 'update'; nodeId: string; templateId: string }
  | { kind: 'remove'; nodeId: string }
  | { kind: 'clear-selection' };

const NONE: StyleNodeSyncAction = { kind: 'none' };

export function isStyleSyncReady(
  selectedTemplateId: string | null,
  templates: ReadonlyArray<{ id: string }>,
): boolean {
  if (templates.length === 0) return false;
  if (selectedTemplateId === null) return true;
  return templates.some((template) => template.id === selectedTemplateId);
}

export function resolveStyleNodeSyncAction({
  selectedTemplateId,
  styleNode,
  lastSyncedTemplateId,
  everObservedStyleNode,
}: StyleNodeSyncInput): StyleNodeSyncAction {
  const isFirstSync = lastSyncedTemplateId === undefined;

  if (selectedTemplateId === null) {
    if (isFirstSync || lastSyncedTemplateId === null) return NONE;
    if (!styleNode || styleNode.sharedWithOtherTargets) return NONE;
    return { kind: 'remove', nodeId: styleNode.id };
  }

  if (!styleNode) {
    if (isFirstSync || selectedTemplateId !== lastSyncedTemplateId) {
      return { kind: 'create', templateId: selectedTemplateId };
    }
    return everObservedStyleNode ? { kind: 'clear-selection' } : NONE;
  }

  // 一对多是异常图。两侧图片节点若分别改写同一个投影，会形成无限更新循环。
  if (styleNode.sharedWithOtherTargets) return NONE;

  if (styleNode.templateId !== selectedTemplateId) {
    return {
      kind: 'update',
      nodeId: styleNode.id,
      templateId: selectedTemplateId,
    };
  }

  return NONE;
}

export interface StyleNodeSyncState {
  lastSyncedTemplateId: string | null | undefined;
  everObservedStyleNode: boolean;
}

export const INITIAL_STYLE_NODE_SYNC_STATE: StyleNodeSyncState = {
  lastSyncedTemplateId: undefined,
  everObservedStyleNode: false,
};

export function advanceStyleNodeSync(
  state: StyleNodeSyncState,
  input: Pick<StyleNodeSyncInput, 'selectedTemplateId' | 'styleNode'>,
): { action: StyleNodeSyncAction; state: StyleNodeSyncState } {
  const everObservedStyleNode =
    state.everObservedStyleNode || input.styleNode !== null;
  const action = resolveStyleNodeSyncAction({
    ...input,
    lastSyncedTemplateId: state.lastSyncedTemplateId,
    everObservedStyleNode,
  });

  switch (action.kind) {
    case 'create':
    case 'remove':
      return {
        action,
        state: {
          lastSyncedTemplateId: input.selectedTemplateId,
          everObservedStyleNode: false,
        },
      };
    case 'clear-selection':
      return {
        action,
        state: {
          lastSyncedTemplateId: null,
          everObservedStyleNode: false,
        },
      };
    default:
      return {
        action,
        state: {
          lastSyncedTemplateId: input.selectedTemplateId,
          everObservedStyleNode,
        },
      };
  }
}

// 对账状态必须跨 ImageGenNode 组件卸载保留，避免缩放或重挂载后把用户删除的
// StyleNode 当作从未创建；切换/清空画布时由文档生命周期显式清理。
const syncStates = new Map<string, StyleNodeSyncState>();

export function readStyleNodeSyncState(nodeId: string): StyleNodeSyncState {
  return syncStates.get(nodeId) ?? INITIAL_STYLE_NODE_SYNC_STATE;
}

export function writeStyleNodeSyncState(
  nodeId: string,
  state: StyleNodeSyncState,
): void {
  syncStates.set(nodeId, state);
}

export function resetStyleNodeSyncStates(): void {
  syncStates.clear();
}

export const STYLE_NODE_GAP = 28;

export function resolveStyleNodePlacement(input: {
  imageNodePosition: { x: number; y: number };
  imageNodeHeight: number;
  styleNodeWidth: number;
  styleNodeHeight: number;
}): { x: number; y: number } {
  return {
    x: input.imageNodePosition.x - input.styleNodeWidth - STYLE_NODE_GAP,
    y:
      input.imageNodePosition.y
      + (input.imageNodeHeight - input.styleNodeHeight) / 2,
  };
}
