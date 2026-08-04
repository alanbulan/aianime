// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { skillGroupsForNodeSelectionMenu } from '../domain/nodeSelectionMenuModel';
import type {
  SkillDefinition,
  SkillProvider,
} from '../domain/skillContract';
import {
  CanvasAddNodeGrid,
  CanvasMenuSectionHeader,
  CanvasSkillPanel,
  CanvasSkillProviderRows,
  type NodeSelectionMenuNodeDefinition,
} from './CanvasNodeMenuPrimitives';

const SKILL_PANEL_CLOSE_DELAY_MS = 40;

export interface CanvasAddNodePanelProps<
  TNodeType extends string = string,
> {
  nodeDefinitions: readonly NodeSelectionMenuNodeDefinition<TNodeType>[];
  skillItems: readonly SkillDefinition[];
  onSelectNode: (type: TNodeType) => void;
  onSelectSkill: (skill: SkillDefinition) => void;
  onClose: () => void;
}

export function CanvasAddNodePanel<TNodeType extends string>({
  nodeDefinitions,
  skillItems,
  onSelectNode,
  onSelectSkill,
  onClose,
}: CanvasAddNodePanelProps<TNodeType>) {
  const { t } = useTranslation();
  const [activeSkillProvider, setActiveSkillProvider] =
    useState<SkillProvider | null>(null);
  const skillRowsRef = useRef<HTMLDivElement>(null);
  const skillPanelRef = useRef<HTMLDivElement>(null);
  const skillPanelCloseTimerRef = useRef<number | null>(null);

  const skillGroups = useMemo(
    () => skillGroupsForNodeSelectionMenu(skillItems),
    [skillItems],
  );
  const activeSkillGroup = useMemo(() => {
    if (!activeSkillProvider) {
      return null;
    }
    return skillGroups.find(
      (group) => group.provider === activeSkillProvider,
    ) ?? null;
  }, [activeSkillProvider, skillGroups]);

  useEffect(() => {
    if (
      activeSkillProvider
      && !skillGroups.some((group) => group.provider === activeSkillProvider)
    ) {
      setActiveSkillProvider(null);
    }
  }, [activeSkillProvider, skillGroups]);

  const handlePickNode = (type: TNodeType) => {
    onSelectNode(type);
    onClose();
  };

  const handlePickSkill = (skill: SkillDefinition) => {
    onSelectSkill(skill);
    onClose();
  };

  const cancelSkillPanelClose = useCallback(() => {
    if (skillPanelCloseTimerRef.current !== null) {
      window.clearTimeout(skillPanelCloseTimerRef.current);
      skillPanelCloseTimerRef.current = null;
    }
  }, []);

  const scheduleSkillPanelClose = useCallback(() => {
    cancelSkillPanelClose();
    skillPanelCloseTimerRef.current = window.setTimeout(() => {
      setActiveSkillProvider(null);
      skillPanelCloseTimerRef.current = null;
    }, SKILL_PANEL_CLOSE_DELAY_MS);
  }, [cancelSkillPanelClose]);

  useEffect(() => cancelSkillPanelClose, [cancelSkillPanelClose]);

  useEffect(() => {
    if (!activeSkillProvider) {
      return;
    }

    const isPointInside = (
      element: HTMLElement | null,
      x: number,
      y: number,
    ) => {
      if (!element) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const insideSkillRows = isPointInside(
        skillRowsRef.current,
        event.clientX,
        event.clientY,
      );
      const insideSkillPanel = isPointInside(
        skillPanelRef.current,
        event.clientX,
        event.clientY,
      );
      if (insideSkillRows || insideSkillPanel) {
        cancelSkillPanelClose();
        return;
      }
      scheduleSkillPanelClose();
    };

    document.addEventListener('pointermove', handlePointerMove, true);
    return () => document.removeEventListener(
      'pointermove',
      handlePointerMove,
      true,
    );
  }, [activeSkillProvider, cancelSkillPanelClose, scheduleSkillPanelClose]);

  return (
    <div
      className="relative"
      onPointerEnter={cancelSkillPanelClose}
      onPointerLeave={scheduleSkillPanelClose}
    >
      <div className="w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[18px] border border-border bg-popover/95 shadow-xl backdrop-blur-2xl">
        <div className="ui-scrollbar max-h-[min(560px,70vh)] overflow-y-auto px-5 py-5 [scrollbar-gutter:stable]">
          <CanvasMenuSectionHeader
            label={t('node.menu.sectionAddNode')}
            className="pb-4"
          />
          <CanvasAddNodeGrid
            nodeDefinitions={nodeDefinitions}
            translate={t}
            onSelectNode={handlePickNode}
          />

          {skillGroups.length > 0 && (
            <>
              <CanvasMenuSectionHeader
                label={t('node.menu.sectionSkillNode')}
                className="pb-3 pt-5"
              />
              <CanvasSkillProviderRows
                groups={skillGroups}
                activeProvider={activeSkillProvider}
                rowsRef={skillRowsRef}
                onCancelClose={cancelSkillPanelClose}
                onShowProvider={setActiveSkillProvider}
              />
            </>
          )}
        </div>
      </div>
      {activeSkillGroup && (
        <CanvasSkillPanel
          group={activeSkillGroup}
          translate={t}
          panelRef={skillPanelRef}
          onCancelClose={cancelSkillPanelClose}
          onScheduleClose={scheduleSkillPanelClose}
          onSelectSkill={handlePickSkill}
        />
      )}
    </div>
  );
}
