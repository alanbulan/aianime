// Copyright (c) 2026 AI anime
import type { MouseEvent as ReactMouseEvent } from "react";
import type { LucideIcon } from "lucide-react";

import { UiChipButton } from "@/components/ui";
import {
  NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS,
  NODE_ACTION_TOOLBAR_NEUTRAL_BUTTON_CLASS,
} from "./canvasNodeActionToolbarStyles";

export interface NodeToolbarIconChipProps {
  label: string;
  icon: LucideIcon;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  extraButtonClass?: string;
}

export function NodeToolbarIconChip({
  label,
  icon: Icon,
  onClick,
  extraButtonClass = "",
}: NodeToolbarIconChipProps) {
  return (
    <div className="group/iconchip relative">
      <UiChipButton
        title={label}
        aria-label={label}
        className={`h-9 w-9 justify-center !px-0 ${NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS} text-sm ${NODE_ACTION_TOOLBAR_NEUTRAL_BUTTON_CLASS} ${extraButtonClass}`}
        onClick={onClick}
      >
        <Icon className="h-4 w-4" />
      </UiChipButton>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-[140] mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-150 delay-100 group-hover/iconchip:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
