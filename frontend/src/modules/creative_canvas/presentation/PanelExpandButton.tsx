// Copyright (c) 2026 AI anime
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_INPUT_SURFACE_CLASS } from './canvasNodeFrameStyles';

export interface PanelExpandButtonProps {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}

export function PanelExpandButton({
  expanded,
  onToggle,
  className,
}: PanelExpandButtonProps) {
  const { t } = useTranslation();
  const label = expanded
    ? t('node.operationPanel.collapse')
    : t('node.operationPanel.expand');
  return (
    <button
      type="button"
      data-ui-tooltip={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className={`nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${CANVAS_NODE_INPUT_SURFACE_CLASS} text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${className ?? ''}`}
    >
      {expanded ? (
        <Minimize2 className="h-3.5 w-3.5" />
      ) : (
        <Maximize2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
