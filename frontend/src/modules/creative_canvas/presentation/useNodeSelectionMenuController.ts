// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { UI_POPOVER_TRANSITION_MS } from '@/components/ui/motion';
import type {
  SkillDefinition,
  SkillProvider,
} from '../domain/skillContract';
import {
  referenceGenerateItemsForAllowedTypes,
  skillGroupsForNodeSelectionMenu,
} from '../domain/nodeSelectionMenuModel';

const SKILL_PANEL_CLOSE_DELAY_MS = 40;
const MENU_VIEWPORT_MARGIN = 12;
const SKILL_PANEL_GAP = 8;

export interface NodeSelectionMenuControllerOptions<
  TNodeType extends string = string,
> {
  position: { x: number; y: number };
  allowedTypes?: readonly TNodeType[];
  onSelect: (
    type: TNodeType,
    clientPosition?: { x: number; y: number },
  ) => void;
  skillItems?: readonly SkillDefinition[];
  onSelectSkill?: (skill: SkillDefinition) => void;
  onClose: () => void;
}

export function useNodeSelectionMenuController<TNodeType extends string>({
  position,
  allowedTypes,
  onSelect,
  skillItems,
  onSelectSkill,
  onClose,
}: NodeSelectionMenuControllerOptions<TNodeType>) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const skillPanelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [panelPosition, setPanelPosition] = useState(position);
  const [skillPanelSide, setSkillPanelSide] = useState<'left' | 'right'>('right');
  const [activeSkillProvider, setActiveSkillProvider] =
    useState<SkillProvider | null>(null);
  const skillPanelCloseTimerRef = useRef<number | null>(null);

  const referenceGenerateItems = useMemo(
    () => referenceGenerateItemsForAllowedTypes(allowedTypes),
    [allowedTypes],
  );
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

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const menuElement = menuRef.current;
    const mainPanelElement = mainPanelRef.current;
    const viewportElement = menuElement?.offsetParent as HTMLElement | null;
    if (!menuElement || !mainPanelElement || !viewportElement) {
      return;
    }

    const mainWidth = mainPanelElement.offsetWidth;
    const mainHeight = mainPanelElement.offsetHeight;
    const viewportWidth = viewportElement.clientWidth;
    const viewportHeight = viewportElement.clientHeight;
    const maxX = Math.max(
      MENU_VIEWPORT_MARGIN,
      viewportWidth - mainWidth - MENU_VIEWPORT_MARGIN,
    );
    const maxY = Math.max(
      MENU_VIEWPORT_MARGIN,
      viewportHeight - mainHeight - MENU_VIEWPORT_MARGIN,
    );
    const nextX = Math.min(Math.max(position.x, MENU_VIEWPORT_MARGIN), maxX);
    const nextY = Math.min(Math.max(position.y, MENU_VIEWPORT_MARGIN), maxY);
    const skillPanelWidth = skillPanelRef.current?.offsetWidth ?? 0;
    const hasSpaceOnRight =
      !activeSkillProvider
      || nextX + mainWidth + SKILL_PANEL_GAP + skillPanelWidth
        <= viewportWidth - MENU_VIEWPORT_MARGIN;
    const hasSpaceOnLeft =
      activeSkillProvider
      && nextX - SKILL_PANEL_GAP - skillPanelWidth >= MENU_VIEWPORT_MARGIN;

    setPanelPosition((current) => (
      current.x === nextX && current.y === nextY
        ? current
        : { x: nextX, y: nextY }
    ));
    setSkillPanelSide(hasSpaceOnRight || !hasSpaceOnLeft ? 'right' : 'left');
    setIsPositioned(true);
  }, [activeSkillProvider, position.x, position.y]);

  const close = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, UI_POPOVER_TRANSITION_MS);
  }, [onClose]);

  const selectNode = useCallback((
    type: TNodeType,
    clientPosition?: { x: number; y: number },
  ) => {
    close();
    setTimeout(
      () => onSelect(type, clientPosition),
      UI_POPOVER_TRANSITION_MS + 10,
    );
  }, [close, onSelect]);

  const selectSkill = useCallback((skill: SkillDefinition) => {
    if (!onSelectSkill) {
      return;
    }
    onSelectSkill(skill);
    close();
  }, [close, onSelectSkill]);

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

  const showSkillProvider = useCallback((provider: SkillProvider) => {
    setActiveSkillProvider(provider);
  }, []);

  useEffect(() => cancelSkillPanelClose, [cancelSkillPanelClose]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [close]);

  useEffect(() => {
    if (!activeSkillProvider) {
      return;
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        scheduleSkillPanelClose();
      }
    };
    document.addEventListener('pointermove', onPointerMove, true);
    return () => document.removeEventListener('pointermove', onPointerMove, true);
  }, [activeSkillProvider, scheduleSkillPanelClose]);

  return {
    translate: t,
    menuRef,
    mainPanelRef,
    skillPanelRef,
    isVisible,
    isPositioned,
    panelPosition,
    skillPanelSide,
    referenceGenerateItems,
    skillGroups,
    activeSkillProvider,
    activeSkillGroup,
    canSelectSkill: Boolean(onSelectSkill),
    close,
    selectNode,
    selectSkill,
    showSkillProvider,
    cancelSkillPanelClose,
    scheduleSkillPanelClose,
  };
}

export type NodeSelectionMenuController<TNodeType extends string = string> =
  ReturnType<typeof useNodeSelectionMenuController<TNodeType>>;
