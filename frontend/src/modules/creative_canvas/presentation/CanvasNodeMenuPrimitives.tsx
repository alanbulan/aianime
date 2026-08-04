// Copyright (c) 2026 AI anime
import type { Ref } from 'react';
import type { TFunction } from 'i18next';
import {
  ChevronRight,
  FileText,
  Film,
  Globe,
  Image,
  LayoutGrid,
  Music,
  Orbit,
  Sparkles,
  Type,
  Upload,
  Video,
} from 'lucide-react';

import {
  NODE_SELECTION_MENU_SKILL_PROVIDER_LABELS,
  type NodeSelectionSkillGroup,
} from '../domain/nodeSelectionMenuModel';
import type {
  SkillDefinition,
  SkillProvider,
} from '../domain/skillContract';
import { translateSkillDescription, translateSkillName } from './skillI18n';

export type CanvasNodeMenuIconKey =
  | 'upload'
  | 'sparkles'
  | 'layout'
  | 'text'
  | 'video'
  | 'audio'
  | 'script'
  | 'pano360'
  | 'threeDWorld'
  | 'videoCompose';

export interface NodeSelectionMenuNodeDefinition<
  TNodeType extends string = string,
> {
  type: TNodeType;
  label: string;
  icon: CanvasNodeMenuIconKey;
}

const MENU_ICON_MAP = {
  upload: Upload,
  sparkles: Sparkles,
  layout: LayoutGrid,
  text: Type,
  video: Video,
  audio: Music,
  script: FileText,
  pano360: Globe,
  threeDWorld: Orbit,
  videoCompose: Film,
};

export const CANVAS_MENU_ICON_CELL_CLASS =
  'flex min-w-[58px] max-w-[96px] flex-col items-center gap-1.5 rounded-xl px-2.5 py-2 text-center transition-colors';
export const CANVAS_MENU_ROW_CLASS =
  'flex w-full items-center gap-3 rounded-xl py-2 pl-[17px] pr-2 text-left transition-colors';

export function CanvasMenuSectionHeader({
  label,
  className = '',
}: {
  label: string;
  className?: string;
}) {
  return (
    <div className={`text-[15px] font-semibold leading-none text-foreground/70 ${className}`}>
      {label}
    </div>
  );
}

export interface CanvasAddNodeGridProps<TNodeType extends string = string> {
  nodeDefinitions: readonly NodeSelectionMenuNodeDefinition<TNodeType>[];
  translate: TFunction;
  onSelectNode: (
    type: TNodeType,
    clientPosition?: { x: number; y: number },
  ) => void;
  onItemPointerEnter?: () => void;
  transitionDelayForIndex?: (index: number) => string | undefined;
}

export function CanvasAddNodeGrid<TNodeType extends string>({
  nodeDefinitions,
  translate,
  onSelectNode,
  onItemPointerEnter,
  transitionDelayForIndex,
}: CanvasAddNodeGridProps<TNodeType>) {
  return (
    <div className="grid grid-cols-4 justify-items-center gap-x-2 gap-y-5">
      {nodeDefinitions.map((definition, index) => {
        const Icon = MENU_ICON_MAP[definition.icon] ?? Image;
        return (
          <button
            key={definition.type}
            type="button"
            onMouseEnter={onItemPointerEnter}
            className={`${CANVAS_MENU_ICON_CELL_CLASS} hover:bg-muted`}
            style={{ transitionDelay: transitionDelayForIndex?.(index) }}
            onClick={(event) => onSelectNode(
              definition.type,
              { x: event.clientX, y: event.clientY },
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-5 text-foreground/85">
              {translate(definition.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface CanvasSkillProviderRowsProps {
  groups: readonly NodeSelectionSkillGroup[];
  activeProvider: SkillProvider | null;
  rowsRef?: Ref<HTMLDivElement>;
  transitionDelayForIndex?: (index: number) => string | undefined;
  onCancelClose: () => void;
  onShowProvider: (provider: SkillProvider) => void;
}

export function CanvasSkillProviderRows({
  groups,
  activeProvider,
  rowsRef,
  transitionDelayForIndex,
  onCancelClose,
  onShowProvider,
}: CanvasSkillProviderRowsProps) {
  return (
    <div ref={rowsRef}>
      {groups.map((group, index) => (
        <button
          key={group.provider}
          type="button"
          className={`${CANVAS_MENU_ROW_CLASS} hover:bg-muted ${
            activeProvider === group.provider ? 'bg-muted' : ''
          }`}
          style={{ transitionDelay: transitionDelayForIndex?.(index) }}
          onMouseEnter={() => {
            onCancelClose();
            onShowProvider(group.provider);
          }}
          onFocus={() => {
            onCancelClose();
            onShowProvider(group.provider);
          }}
          onClick={() => onShowProvider(group.provider)}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] leading-5 text-popover-foreground/85">
              {NODE_SELECTION_MENU_SKILL_PROVIDER_LABELS[group.provider]}
            </div>
            <div className="text-[11px] leading-4 text-muted-foreground">
              {group.items.length} 个技能
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

export interface CanvasSkillPanelProps {
  group: NodeSelectionSkillGroup;
  translate: TFunction;
  side?: 'left' | 'right';
  panelRef?: Ref<HTMLDivElement>;
  transitionDelayForIndex?: (index: number) => string | undefined;
  onCancelClose: () => void;
  onScheduleClose: () => void;
  onSelectSkill: (skill: SkillDefinition) => void;
}

export function CanvasSkillPanel({
  group,
  translate,
  side = 'right',
  panelRef,
  transitionDelayForIndex,
  onCancelClose,
  onScheduleClose,
  onSelectSkill,
}: CanvasSkillPanelProps) {
  return (
    <div
      ref={panelRef}
      className={`absolute top-0 w-[420px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[18px] border border-border bg-popover/95 shadow-xl backdrop-blur-2xl ${
        side === 'right'
          ? 'left-[calc(100%+8px)]'
          : 'right-[calc(100%+8px)]'
      }`}
      onPointerEnter={onCancelClose}
      onPointerLeave={onScheduleClose}
    >
      <div className="px-5 pb-3 pt-5 text-[15px] font-semibold leading-none text-popover-foreground/70">
        {NODE_SELECTION_MENU_SKILL_PROVIDER_LABELS[group.provider]}
      </div>
      <div className="ui-scrollbar max-h-[420px] overflow-y-auto px-3 pb-4 [scrollbar-gutter:stable]">
        {group.items.map((skill, index) => (
          <button
            key={skill.id}
            type="button"
            className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted"
            style={{ transitionDelay: transitionDelayForIndex?.(index) }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectSkill(skill);
            }}
          >
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] leading-5 text-popover-foreground/85">
                {translateSkillName(skill, translate)}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-muted-foreground">
                {translateSkillDescription(skill, translate) || skill.id}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
