// Copyright (c) 2026 AI anime
import {
  ChevronDown,
  Crop,
  Eraser,
  Expand,
  ImageUpscale,
  Scissors,
  Wand2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { UiChipButton } from "@/components/ui";
import type { ImageEditToolbarActionKey } from "@/features/canvas/application/imageEditToolbarModel";
import type { ImageEditToolbarController } from "@/features/canvas/hooks/useImageEditToolbarController";

import {
  NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "./nodeActionToolbarStyles";

const actionIconMap: Record<ImageEditToolbarActionKey, typeof Crop> = {
  repaint: Wand2,
  erase: Eraser,
  matting: Scissors,
  crop: Crop,
  hd: ImageUpscale,
  outpaint: Expand,
};

export interface ImageEditToolbarActionsViewProps {
  controller: ImageEditToolbarController;
}

export function ImageEditToolbarActionsView({
  controller,
}: ImageEditToolbarActionsViewProps) {
  const {
    actions,
    activeAction,
    menuRootProps,
    menuHoverProps,
    selectAction,
  } = controller;
  const ActiveIcon = actionIconMap[activeAction.key];

  return (
    <DropdownMenu {...menuRootProps}>
      <DropdownMenuTrigger asChild>
        <UiChipButton
          className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
          onClick={(event) => event.stopPropagation()}
          {...menuHoverProps}
        >
          <ActiveIcon className="h-3.5 w-3.5" />
          {activeAction.label}
          <ChevronDown className="h-3 w-3" />
        </UiChipButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={`${NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS} min-w-[180px]`}
        onClick={(event) => event.stopPropagation()}
        {...menuHoverProps}
      >
        {actions.map((action) => {
          const Icon = actionIconMap[action.key];
          return (
            <DropdownMenuItem
              key={action.key}
              className={NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS}
              onSelect={() => selectAction(action.key)}
            >
              <Icon className="h-4 w-4" />
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
