// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasNodeType,
} from '@/features/canvas/domain/canvasNodes';
import type {
  SkillDefinition,
  SkillProvider,
} from '@/modules/creative_canvas/public';

export const SKILL_PROVIDER_LABELS: Record<SkillProvider, string> = {
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

export interface ReferenceGenerateAction {
  key: ReferenceGenerateActionKey;
  label: string;
  type?: CanvasNodeType;
  disabled?: boolean;
  beta?: boolean;
}

export interface NodeSelectionSkillGroup {
  provider: SkillProvider;
  items: SkillDefinition[];
}

export function referenceGenerateItemsForAllowedTypes(
  allowedTypes: CanvasNodeType[] | undefined,
): ReferenceGenerateAction[] | null {
  if (!allowedTypes) {
    return null;
  }
  const allowedTypeSet = new Set(allowedTypes);
  const items: ReferenceGenerateAction[] = [
    {
      key: 'text',
      label: '文本',
      type: allowedTypeSet.has(CANVAS_NODE_TYPES.textAnnotation)
        ? CANVAS_NODE_TYPES.textAnnotation
        : undefined,
      disabled: !allowedTypeSet.has(CANVAS_NODE_TYPES.textAnnotation),
    },
    {
      key: 'image',
      label: '图片',
      type: allowedTypeSet.has(CANVAS_NODE_TYPES.imageGen)
        ? CANVAS_NODE_TYPES.imageGen
        : allowedTypeSet.has(CANVAS_NODE_TYPES.imageEdit)
          ? CANVAS_NODE_TYPES.imageEdit
          : allowedTypeSet.has(CANVAS_NODE_TYPES.upload)
            ? CANVAS_NODE_TYPES.upload
            : undefined,
      disabled:
        !allowedTypeSet.has(CANVAS_NODE_TYPES.imageGen)
        && !allowedTypeSet.has(CANVAS_NODE_TYPES.imageEdit)
        && !allowedTypeSet.has(CANVAS_NODE_TYPES.upload),
    },
    {
      key: 'video',
      label: '视频',
      type: allowedTypeSet.has(CANVAS_NODE_TYPES.video)
        ? CANVAS_NODE_TYPES.video
        : undefined,
      disabled: !allowedTypeSet.has(CANVAS_NODE_TYPES.video),
    },
    {
      key: 'audio',
      label: '音频',
      type: allowedTypeSet.has(CANVAS_NODE_TYPES.audio)
        ? CANVAS_NODE_TYPES.audio
        : undefined,
      disabled: !allowedTypeSet.has(CANVAS_NODE_TYPES.audio),
    },
    {
      key: 'script',
      label: '脚本',
      type: allowedTypeSet.has(CANVAS_NODE_TYPES.script)
        ? CANVAS_NODE_TYPES.script
        : undefined,
      disabled: !allowedTypeSet.has(CANVAS_NODE_TYPES.script),
    },
    {
      key: 'pano360',
      label: '360° 全景',
      type: allowedTypeSet.has(CANVAS_NODE_TYPES.pano360Viewer)
        ? CANVAS_NODE_TYPES.pano360Viewer
        : undefined,
      disabled: !allowedTypeSet.has(CANVAS_NODE_TYPES.pano360Viewer),
    },
    {
      key: 'threeDWorld',
      label: '3D 世界',
      type: allowedTypeSet.has(CANVAS_NODE_TYPES.threeDWorld)
        ? CANVAS_NODE_TYPES.threeDWorld
        : undefined,
      disabled: !allowedTypeSet.has(CANVAS_NODE_TYPES.threeDWorld),
      beta: true,
    },
  ];
  const enabled = items.filter((item) => !item.disabled && item.type);
  return enabled.length > 0 ? enabled : null;
}

export function skillGroupsForNodeSelectionMenu(
  skillItems: SkillDefinition[] | undefined,
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
