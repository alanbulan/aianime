// Copyright (c) 2026 AI anime
import {
  ChevronDown,
  FastForward,
  Film,
  Grid2x2,
  Grid3x3,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Rewind,
  User,
  Users,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UiChipButton } from '@/components/ui';
import type { GridActionKey } from '../domain/gridAction';
import type { ImageGridToolbarController } from './useImageGridToolbarController';

const actionIconMap: Record<GridActionKey, typeof LayoutGrid> = {
  multiCameraGrid: Grid3x3,
  plotFourGrid: Grid2x2,
  faceThreeView: User,
  productThreeView: Package,
  serialStoryboard25: LayoutDashboard,
  cinematicLightCorrection: Film,
  characterThreeView: Users,
  frameProjection3sLater: FastForward,
  frameProjection5sEarlier: Rewind,
};

export interface ImageGridToolbarStyleClasses {
  menuContent: string;
  menuItem: string;
  textButton: string;
}

export interface ImageGridToolbarActionsViewProps {
  controller: ImageGridToolbarController;
  styles: ImageGridToolbarStyleClasses;
}

export function ImageGridToolbarActionsView({
  controller,
  styles,
}: ImageGridToolbarActionsViewProps) {
  const {
    t,
    actions,
    activeActionKey,
    menuRootProps,
    menuHoverProps,
    selectAction,
  } = controller;

  return (
    <DropdownMenu {...menuRootProps}>
      <DropdownMenuTrigger asChild>
        <UiChipButton
          className={styles.textButton}
          onClick={(event) => event.stopPropagation()}
          {...menuHoverProps}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {t('nodeToolbar.gridMenu.trigger')}
          <ChevronDown className="h-3 w-3" />
        </UiChipButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={`${styles.menuContent} min-w-[200px]`}
        onClick={(event) => event.stopPropagation()}
        {...menuHoverProps}
      >
        {actions.map((action) => {
          const Icon = actionIconMap[action.key];
          const isActive = action.key === activeActionKey;
          return (
            <DropdownMenuItem
              key={action.key}
              className={
                isActive
                  ? 'gap-2 bg-primary/15 text-primary focus:bg-primary/25 focus:text-primary'
                  : styles.menuItem
              }
              onSelect={() => selectAction(action)}
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
