// Copyright (c) 2026 AI anime
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  CANVAS_NODE_OPS_PANEL_CLASS,
  NODE_OPS_PANEL_ENTER_CLASS,
} from './canvasNodeFrameStyles';

export interface OperationPanelShellProps {
  expanded: boolean;
  onCollapse: () => void;
  inlineClassName: string;
  inlineStyle: CSSProperties;
  modalStyle?: CSSProperties;
  children: ReactNode;
}

function stopPropagation(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

export function OperationPanelShell({
  expanded,
  onCollapse,
  inlineClassName,
  inlineStyle,
  modalStyle,
  children,
}: OperationPanelShellProps) {
  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [expanded, onCollapse]);

  if (!expanded) {
    return (
      <div
        className={`${inlineClassName} ${NODE_OPS_PANEL_ENTER_CLASS}`}
        style={inlineStyle}
        onClick={stopPropagation}
      >
        {children}
      </div>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-6 backdrop-blur-sm"
      onClick={onCollapse}
      onPointerDown={stopPropagation}
    >
      <div
        className={`nodrag nowheel relative flex max-h-full max-w-full flex-col rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS}`}
        style={modalStyle}
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
