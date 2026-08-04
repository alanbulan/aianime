// Copyright (c) 2026 AI anime
import {
  ChevronDown,
  Crop,
  Eraser,
  Expand,
  ImageUpscale,
  Scissors,
  Wand2,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu';
import { UiChipButton } from '@/components/ui';
import type { ImageEditToolbarActionKey } from '../domain/imageEditToolbarModel';
import type { ImageEditToolbarController } from './useImageEditToolbarController';

const actionIconMap: Record<ImageEditToolbarActionKey, typeof Crop> = {
  repaint: Wand2,
  erase: Eraser,
  matting: Scissors,
  crop: Crop,
  hd: ImageUpscale,
  outpaint: Expand,
};

export interface ImageEditToolbarStyleClasses {
  menuContent: string;
  menuItem: string;
  textButton: string;
}

export interface ImageEditToolbarActionsViewProps {
  controller: ImageEditToolbarController;
  styles: ImageEditToolbarStyleClasses;
}

export function ImageEditToolbarActionsView({
  controller,
  styles,
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
          className={styles.textButton}
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
        className={`${styles.menuContent} min-w-[180px]`}
        onClick={(event) => event.stopPropagation()}
        {...menuHoverProps}
      >
        {actions.map((action) => {
          const Icon = actionIconMap[action.key];
          return (
            <DropdownMenuItem
              key={action.key}
              className={styles.menuItem}
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
