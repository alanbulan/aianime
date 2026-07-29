// Copyright (c) 2026 AI anime
import {
  ChevronRight,
  FileText,
  Globe,
  Image,
  Music,
  Orbit,
  Sparkles,
  Type,
  Video,
} from 'lucide-react';

import type { NodeSelectionMenuController } from '@/features/canvas/hooks/useNodeSelectionMenuController';
import {
  translateSkillDescription,
  translateSkillName,
} from '@/features/freezone/public';

import {
  CanvasAddNodeGrid,
  CanvasMenuSectionHeader,
  CANVAS_MENU_ICON_CELL_CLASS,
  CANVAS_MENU_ROW_CLASS,
} from './canvas-node-menu-shared';
import {
  SKILL_PROVIDER_LABELS,
  type ReferenceGenerateActionKey,
} from './nodeSelectionMenuModel';

const REFERENCE_GENERATE_ICONS: Record<
  ReferenceGenerateActionKey,
  typeof Image
> = {
  text: Type,
  image: Image,
  video: Video,
  audio: Music,
  script: FileText,
  pano360: Globe,
  threeDWorld: Orbit,
};

export function NodeSelectionMenuView({
  controller,
}: {
  controller: NodeSelectionMenuController;
}) {
  const visible = controller.isVisible && controller.isPositioned;

  return (
    <div
      ref={controller.menuRef}
      onPointerLeave={controller.scheduleSkillPanelClose}
      onPointerEnter={controller.cancelSkillPanelClose}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={`
        absolute z-50
        transition-opacity duration-150
        ${visible ? 'opacity-100' : 'opacity-0'}
      `}
      style={{
        left: controller.panelPosition.x,
        top: controller.panelPosition.y,
      }}
    >
      <div
        ref={controller.mainPanelRef}
        className="w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[18px] border border-border bg-popover/95 shadow-xl backdrop-blur-2xl"
      >
        <div className="ui-scrollbar max-h-[min(560px,70vh)] overflow-y-auto px-5 py-5 [scrollbar-gutter:stable]">
          {controller.referenceGenerateItems ? (
            <>
              <CanvasMenuSectionHeader label="引用该节点生成" className="pb-4" />
              <div className="grid grid-cols-4 justify-items-center gap-x-2 gap-y-5">
                {controller.referenceGenerateItems.map((item, index) => {
                  const Icon = REFERENCE_GENERATE_ICONS[item.key];
                  return (
                    <button
                      key={item.key}
                      disabled={item.disabled}
                      onMouseEnter={controller.scheduleSkillPanelClose}
                      className={`${CANVAS_MENU_ICON_CELL_CLASS} ${
                        item.disabled
                          ? 'cursor-not-allowed opacity-35'
                          : 'hover:bg-muted'
                      }`}
                      style={{
                        transitionDelay: controller.isVisible
                          ? `${index * 30}ms`
                          : '0ms',
                      }}
                      onClick={(event) => {
                        if (item.type && !item.disabled) {
                          controller.selectNode(item.type, {
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }
                      }}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-5 text-popover-foreground/85">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <CanvasMenuSectionHeader
                label={controller.translate('node.menu.sectionAddNode')}
                className="pb-4"
              />
              <CanvasAddNodeGrid
                onItemPointerEnter={controller.scheduleSkillPanelClose}
                transitionDelayForIndex={(index) => (
                  controller.isVisible ? `${index * 30}ms` : '0ms'
                )}
                onSelectNode={controller.selectNode}
              />
              {controller.canSelectSkill && controller.skillGroups.length > 0 && (
                <>
                  <CanvasMenuSectionHeader
                    label={controller.translate('node.menu.sectionSkillNode')}
                    className="pb-3 pt-5"
                  />
                  {controller.skillGroups.map((group, index) => (
                    <button
                      key={group.provider}
                      type="button"
                      className={`${CANVAS_MENU_ROW_CLASS} hover:bg-muted ${
                        controller.activeSkillProvider === group.provider
                          ? 'bg-muted'
                          : ''
                      }`}
                      style={{
                        transitionDelay: controller.isVisible
                          ? `${(index + 10) * 30}ms`
                          : '0ms',
                      }}
                      onMouseEnter={() => {
                        controller.cancelSkillPanelClose();
                        controller.showSkillProvider(group.provider);
                      }}
                      onFocus={() => {
                        controller.cancelSkillPanelClose();
                        controller.showSkillProvider(group.provider);
                      }}
                      onClick={() => controller.showSkillProvider(group.provider)}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] leading-5 text-popover-foreground/85">
                          {SKILL_PROVIDER_LABELS[group.provider]}
                        </div>
                        <div className="text-[11px] leading-4 text-muted-foreground">
                          {group.items.length} 个技能
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {controller.canSelectSkill && controller.activeSkillGroup && (
        <div
          ref={controller.skillPanelRef}
          className={`absolute top-0 w-[420px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[18px] border border-border bg-popover/95 shadow-xl backdrop-blur-2xl ${
            controller.skillPanelSide === 'right'
              ? 'left-[calc(100%+8px)]'
              : 'right-[calc(100%+8px)]'
          }`}
          onPointerEnter={controller.cancelSkillPanelClose}
          onPointerLeave={controller.scheduleSkillPanelClose}
        >
          <div className="px-5 pb-3 pt-5 text-[15px] font-semibold leading-none text-popover-foreground/70">
            {SKILL_PROVIDER_LABELS[controller.activeSkillGroup.provider]}
          </div>
          <div className="ui-scrollbar max-h-[420px] overflow-y-auto px-3 pb-4 [scrollbar-gutter:stable]">
            {controller.activeSkillGroup.items.map((skill, index) => (
              <button
                key={skill.id}
                type="button"
                className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted"
                style={{
                  transitionDelay: controller.isVisible
                    ? `${index * 30}ms`
                    : '0ms',
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  controller.selectSkill(skill);
                }}
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] leading-5 text-popover-foreground/85">
                    {translateSkillName(skill, controller.translate)}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-muted-foreground">
                    {translateSkillDescription(skill, controller.translate) || skill.id}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
