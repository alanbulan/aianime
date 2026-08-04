// Copyright (c) 2026 AI anime
export const NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS = "rounded-[12px]";

export const NODE_ACTION_TOOLBAR_NEUTRAL_BUTTON_CLASS =
  "!border-transparent !bg-transparent text-foreground hover:!bg-muted focus:!border-transparent focus:!bg-transparent focus:!shadow-none focus-visible:!outline-none focus-visible:!ring-0 data-[state=open]:!border-transparent data-[state=open]:!shadow-none";

export const NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS =
  `h-9 ${NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS} px-3 text-sm ${NODE_ACTION_TOOLBAR_NEUTRAL_BUTTON_CLASS}`;

export const NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS =
  "z-[120] border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-3xl";

export const NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS =
  "gap-2 rounded-[10px] text-popover-foreground focus:bg-muted focus:text-popover-foreground";
