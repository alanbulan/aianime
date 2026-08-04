// Copyright (c) 2026 AI anime
import {
  FileText,
  Globe,
  Image,
  Music,
  Orbit,
  Type,
  Video,
} from 'lucide-react';

import {
  type ReferenceGenerateActionKey,
} from '../domain/nodeSelectionMenuModel';
import {
  CANVAS_MENU_ICON_CELL_CLASS,
  CanvasAddNodeGrid,
  CanvasMenuSectionHeader,
  CanvasSkillPanel,
  CanvasSkillProviderRows,
  type NodeSelectionMenuNodeDefinition,
} from './CanvasNodeMenuPrimitives';
import type { NodeSelectionMenuController } from './useNodeSelectionMenuController';

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

export interface NodeSelectionMenuViewProps<TNodeType extends string = string> {
  controller: NodeSelectionMenuController<TNodeType>;
  nodeDefinitions: readonly NodeSelectionMenuNodeDefinition<TNodeType>[];
}

export function NodeSelectionMenuView<TNodeType extends string>({
  controller,
  nodeDefinitions,
}: NodeSelectionMenuViewProps<TNodeType>) {
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
                nodeDefinitions={nodeDefinitions}
                translate={controller.translate}
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
                  <CanvasSkillProviderRows
                    groups={controller.skillGroups}
                    activeProvider={controller.activeSkillProvider}
                    transitionDelayForIndex={(index) => (
                      controller.isVisible ? `${(index + 10) * 30}ms` : '0ms'
                    )}
                    onCancelClose={controller.cancelSkillPanelClose}
                    onShowProvider={controller.showSkillProvider}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
      {controller.canSelectSkill && controller.activeSkillGroup && (
        <CanvasSkillPanel
          group={controller.activeSkillGroup}
          translate={controller.translate}
          side={controller.skillPanelSide}
          panelRef={controller.skillPanelRef}
          transitionDelayForIndex={(index) => (
            controller.isVisible ? `${index * 30}ms` : '0ms'
          )}
          onCancelClose={controller.cancelSkillPanelClose}
          onScheduleClose={controller.scheduleSkillPanelClose}
          onSelectSkill={controller.selectSkill}
        />
      )}
    </div>
  );
}
