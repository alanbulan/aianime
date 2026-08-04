// Copyright (c) 2026 AI anime
import type {
  SkillDefinition,
  SkillProvider,
} from './skillContract';
import {
  CANVAS_CONNECTION_NODE_TYPES,
  type CanvasConnectionNodeType,
} from './canvasConnection';

export const NODE_SELECTION_MENU_NODE_TYPES = CANVAS_CONNECTION_NODE_TYPES;

export type NodeSelectionMenuNodeType = CanvasConnectionNodeType;

export const NODE_SELECTION_MENU_ADD_NODE_TYPES = [
  NODE_SELECTION_MENU_NODE_TYPES.textAnnotation,
  NODE_SELECTION_MENU_NODE_TYPES.beatContext,
  NODE_SELECTION_MENU_NODE_TYPES.imageGen,
  NODE_SELECTION_MENU_NODE_TYPES.video,
  NODE_SELECTION_MENU_NODE_TYPES.videoCompose,
  NODE_SELECTION_MENU_NODE_TYPES.audio,
  NODE_SELECTION_MENU_NODE_TYPES.script,
  NODE_SELECTION_MENU_NODE_TYPES.upload,
  NODE_SELECTION_MENU_NODE_TYPES.pano360Viewer,
  NODE_SELECTION_MENU_NODE_TYPES.threeDWorld,
] as const satisfies readonly CanvasConnectionNodeType[];

export const NODE_SELECTION_MENU_SKILL_PROVIDER_LABELS: Record<
  SkillProvider,
  string
> = {
  freezone_mainline: '主线技能',
  agent: 'Agent 技能',
  tool: '工具技能',
  workflow: '工作流技能',
};

const SKILL_PROVIDER_ORDER: SkillProvider[] = [
  'freezone_mainline',
  'agent',
  'tool',
  'workflow',
];
const HIDDEN_SKILL_IDS = new Set([
  'agent.review_frame',
  'workflow.plan_beat_graph',
]);

export type ReferenceGenerateActionKey =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'script'
  | 'pano360'
  | 'threeDWorld';

export interface ReferenceGenerateAction<TNodeType extends string = string> {
  key: ReferenceGenerateActionKey;
  label: string;
  type?: TNodeType;
  disabled?: boolean;
  beta?: boolean;
}

export interface NodeSelectionSkillGroup {
  provider: SkillProvider;
  items: SkillDefinition[];
}

export function referenceGenerateItemsForAllowedTypes<
  TNodeType extends string,
>(
  allowedTypes: readonly TNodeType[] | undefined,
): ReferenceGenerateAction<TNodeType>[] | null {
  if (!allowedTypes) {
    return null;
  }
  const nodeTypes = NODE_SELECTION_MENU_NODE_TYPES;
  const allowedTypeSet = new Set<string>(allowedTypes);
  const selectType = (...candidates: string[]): TNodeType | undefined =>
    candidates.find((type) => allowedTypeSet.has(type)) as
      | TNodeType
      | undefined;
  const candidates: ReferenceGenerateAction<TNodeType>[] = [
    {
      key: 'text',
      label: '文本',
      type: selectType(nodeTypes.textAnnotation),
    },
    {
      key: 'image',
      label: '图片',
      type: selectType(
        nodeTypes.imageGen,
        nodeTypes.imageEdit,
        nodeTypes.upload,
      ),
    },
    {
      key: 'video',
      label: '视频',
      type: selectType(nodeTypes.video),
    },
    {
      key: 'audio',
      label: '音频',
      type: selectType(nodeTypes.audio),
    },
    {
      key: 'script',
      label: '脚本',
      type: selectType(nodeTypes.script),
    },
    {
      key: 'pano360',
      label: '360° 全景',
      type: selectType(nodeTypes.pano360Viewer),
    },
    {
      key: 'threeDWorld',
      label: '3D 世界',
      type: selectType(nodeTypes.threeDWorld),
      beta: true,
    },
  ];
  const items = candidates.map((item): ReferenceGenerateAction<TNodeType> => ({
    ...item,
    disabled: item.type === undefined,
  }));
  const enabled = items.filter((item) => item.type !== undefined);
  return enabled.length > 0 ? enabled : null;
}

export function skillGroupsForNodeSelectionMenu(
  skillItems: readonly SkillDefinition[] | undefined,
): NodeSelectionSkillGroup[] {
  if (!skillItems || skillItems.length === 0) {
    return [];
  }
  const byProvider = new Map<SkillProvider, SkillDefinition[]>();
  for (const provider of SKILL_PROVIDER_ORDER) {
    byProvider.set(provider, []);
  }
  for (const skill of skillItems) {
    if (!HIDDEN_SKILL_IDS.has(skill.id)) {
      byProvider.get(skill.provider)?.push(skill);
    }
  }
  return SKILL_PROVIDER_ORDER
    .map((provider) => ({ provider, items: byProvider.get(provider) ?? [] }))
    .filter((group) => group.items.length > 0);
}
