// Copyright (c) 2026 AI anime
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, HelpCircle, Keyboard, Plus } from 'lucide-react';

import type { SkillDefinition } from '../domain/skillContract';
import { CanvasAddNodePanel } from './CanvasAddNodePanel';
import type { NodeSelectionMenuNodeDefinition } from './CanvasNodeMenuPrimitives';
import type { CanvasHistoryAssetsModalCommandProps } from './useCanvasHistoryAssetsModalController';
import { CanvasHelpMenu } from './CanvasHelpMenu';
import { CanvasShortcutsPanel } from './CanvasShortcutsPanel';

type QuickPanel = 'add' | 'history' | 'shortcuts' | 'help';

const HOVER_POPOVER_PANELS: ReadonlySet<QuickPanel> = new Set(['add']);
const ANCHORED_POPOVER_PANELS: ReadonlySet<QuickPanel> = new Set([
  'add',
  'shortcuts',
  'help',
]);

export interface CanvasQuickActionBarProps<
  TNodeType extends string = string,
> {
  projectId: string;
  canvasId: string;
  placement?: 'bottom-right' | 'top-right';
  nodeDefinitions: readonly NodeSelectionMenuNodeDefinition<TNodeType>[];
  skillItems: SkillDefinition[];
  onAddNode: (type: TNodeType) => void;
  onAddSkill: (skill: SkillDefinition) => void;
  onUseAsset: CanvasHistoryAssetsModalCommandProps['onUseAsset'];
  onDeleteNode: CanvasHistoryAssetsModalCommandProps['onDeleteNode'];
  HistoryAssetsModal: ComponentType<CanvasHistoryAssetsModalCommandProps>;
}

interface QuickActionDef {
  key: QuickPanel;
  icon: ComponentType<{ className?: string }>;
  labelKey: string;
  tooltipKey?: string;
  primary?: boolean;
}

const ACTIONS: QuickActionDef[] = [
  { key: 'add', icon: Plus, labelKey: 'canvas.quickbar.addNode', primary: true },
  {
    key: 'history',
    icon: Clock,
    labelKey: 'canvas.quickbar.history',
    tooltipKey: 'canvas.quickbar.history',
  },
  {
    key: 'shortcuts',
    icon: Keyboard,
    labelKey: 'canvas.quickbar.shortcuts',
    tooltipKey: 'canvas.quickbar.shortcuts',
  },
  {
    key: 'help',
    icon: HelpCircle,
    labelKey: 'canvas.quickbar.help',
    tooltipKey: 'canvas.quickbar.viewManual',
  },
];

export function CanvasQuickActionBar<TNodeType extends string>({
  projectId,
  canvasId,
  placement = 'bottom-right',
  nodeDefinitions,
  skillItems,
  onAddNode,
  onAddSkill,
  onUseAsset,
  onDeleteNode,
  HistoryAssetsModal,
}: CanvasQuickActionBarProps<TNodeType>) {
  const { t } = useTranslation();
  const [openPanel, setOpenPanel] = useState<QuickPanel | null>(null);
  const popoverCloseTimerRef = useRef<number | null>(null);
  const isTop = placement === 'top-right';

  const cancelPopoverClose = () => {
    if (popoverCloseTimerRef.current !== null) {
      window.clearTimeout(popoverCloseTimerRef.current);
      popoverCloseTimerRef.current = null;
    }
  };

  const schedulePopoverClose = () => {
    cancelPopoverClose();
    popoverCloseTimerRef.current = window.setTimeout(() => {
      setOpenPanel((current) => (
        current && HOVER_POPOVER_PANELS.has(current) ? null : current
      ));
      popoverCloseTimerRef.current = null;
    }, 120);
  };

  useEffect(() => () => cancelPopoverClose(), []);

  const toggle = (panel: QuickPanel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const handleActionClick = (action: QuickActionDef) => {
    const panel = action.key;
    if (HOVER_POPOVER_PANELS.has(panel)) {
      cancelPopoverClose();
      setOpenPanel(panel);
      return;
    }
    toggle(panel);
  };

  const handleActionHover = (panel: QuickPanel) => {
    if (!HOVER_POPOVER_PANELS.has(panel)) {
      return;
    }
    cancelPopoverClose();
    setOpenPanel(panel);
  };

  const hasPopover = openPanel !== null
    && ANCHORED_POPOVER_PANELS.has(openPanel);
  const popoverAnchorClass = isTop ? 'top-full mt-3' : 'bottom-full mb-3';
  const popoverEnterClass = [
    'animate-in fade-in-0 zoom-in-95 duration-150 ease-out',
    'motion-reduce:animate-none',
    isTop ? 'slide-in-from-top-1' : 'slide-in-from-bottom-1',
  ].join(' ');

  return (
    <>
      {hasPopover && (
        <div
          className="fixed inset-0 z-[40]"
          onClick={() => setOpenPanel(null)}
        />
      )}

      <div
        className={`pointer-events-none absolute inset-x-0 z-[41] flex justify-center ${
          isTop ? 'top-3' : 'bottom-3'
        }`}
      >
        <div
          className="nopan nowheel pointer-events-auto relative"
          onPointerEnter={cancelPopoverClose}
          onPointerLeave={() => {
            if (openPanel !== null && HOVER_POPOVER_PANELS.has(openPanel)) {
              schedulePopoverClose();
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {openPanel === 'add' && (
            <div
              className={`absolute left-0 ${popoverAnchorClass}`}
              onPointerEnter={cancelPopoverClose}
              onPointerLeave={schedulePopoverClose}
            >
              <div className={popoverEnterClass}>
                <CanvasAddNodePanel
                  nodeDefinitions={nodeDefinitions}
                  skillItems={skillItems}
                  onSelectNode={onAddNode}
                  onSelectSkill={onAddSkill}
                  onClose={() => setOpenPanel(null)}
                />
              </div>
            </div>
          )}

          {openPanel === 'shortcuts' && (
            <div
              className={`absolute left-1/2 -translate-x-1/2 ${popoverAnchorClass}`}
            >
              <div className={popoverEnterClass}>
                <CanvasShortcutsPanel onClose={() => setOpenPanel(null)} />
              </div>
            </div>
          )}

          {openPanel === 'help' && (
            <div className={`absolute right-0 ${popoverAnchorClass}`}>
              <div className={popoverEnterClass}>
                <CanvasHelpMenu onClose={() => setOpenPanel(null)} />
              </div>
            </div>
          )}

          <div className="flex h-12 items-center gap-2.5 rounded-[12px] border border-border bg-popover/95 px-1.5 shadow-xl backdrop-blur-md">
            {ACTIONS.map((action) => {
              const { key, icon: Icon, labelKey, tooltipKey, primary } = action;
              const active = openPanel === key;
              const filled = primary || active;
              return (
                <span key={key} className="group relative inline-flex">
                  <button
                    type="button"
                    onMouseEnter={() => handleActionHover(key)}
                    onFocus={() => handleActionHover(key)}
                    onClick={() => handleActionClick(action)}
                    aria-label={t(labelKey)}
                    aria-pressed={active}
                    className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors ${
                      filled
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon
                      className={`h-[18px] w-[18px] ${
                        primary
                          ? 'transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:rotate-45 group-hover:scale-110 motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100'
                          : ''
                      }`}
                    />
                  </button>
                  {tooltipKey && (
                    <span
                      className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-[6px] border border-border bg-popover/95 px-2 py-1 text-[11px] leading-none text-popover-foreground/80 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
                        isTop ? 'top-full mt-2' : 'bottom-full mb-2'
                      }`}
                    >
                      {t(tooltipKey)}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {openPanel === 'history' && (
        <HistoryAssetsModal
          projectId={projectId}
          canvasId={canvasId}
          onClose={() => setOpenPanel(null)}
          onUseAsset={onUseAsset}
          onDeleteNode={onDeleteNode}
        />
      )}
    </>
  );
}
