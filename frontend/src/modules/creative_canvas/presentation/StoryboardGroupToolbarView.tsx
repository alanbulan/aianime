// Copyright (c) 2026 AI anime
import {
  Check,
  ChevronDown,
  Combine,
  Crop,
  Grid2x2,
  Hash,
  Layers,
  Unlink2,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UiChipButton, UiPanel } from '@/components/ui';
import type { StoryboardGroupToolbarController } from '@/modules/creative_canvas/presentation/useStoryboardGroupToolbarController';

export interface StoryboardGroupToolbarStyleClasses {
  panel: string;
  chip: string;
  menuContent: string;
  menuItem: string;
}

export interface StoryboardGroupToolbarViewProps {
  controller: StoryboardGroupToolbarController;
  styles: StoryboardGroupToolbarStyleClasses;
}

export function StoryboardGroupToolbarView({
  controller,
  styles,
}: StoryboardGroupToolbarViewProps) {
  return (
    <UiPanel
      className={styles.panel}
      onClick={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <UiChipButton className={styles.chip}>
            <Crop className="h-4 w-4 text-text-muted" />
            <span>{controller.t('canvas.storyboardGroup.aspect')}</span>
            <span className="text-text-muted">{controller.aspectKey}</span>
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          </UiChipButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={styles.menuContent} align="start">
          {controller.aspectOptions.map((option) => (
            <DropdownMenuItem
              key={option.key}
              className={styles.menuItem}
              onClick={() => controller.setAspect(option.key)}
            >
              {option.key === controller.aspectKey ? (
                <Check className="h-4 w-4 text-text-muted" />
              ) : (
                <span className="h-4 w-4" />
              )}
              <span>{option.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <UiChipButton className={styles.chip}>
            <Grid2x2 className="h-4 w-4 text-text-muted" />
            <span>{controller.t('canvas.storyboardGroup.cols')}</span>
            <span className="text-text-muted">
              {controller.t('canvas.storyboardGroup.colsOption', {
                cols: controller.currentCols,
              })}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          </UiChipButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={styles.menuContent} align="start">
          {controller.colOptions.map((cols) => (
            <DropdownMenuItem
              key={cols}
              className={styles.menuItem}
              onClick={() => controller.setCols(cols)}
            >
              {cols === controller.currentCols ? (
                <Check className="h-4 w-4 text-text-muted" />
              ) : (
                <span className="h-4 w-4" />
              )}
              <span>
                {controller.t('canvas.storyboardGroup.colsOption', { cols })}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <UiChipButton
        className={`${styles.chip} ${controller.showIndex ? '!text-primary' : ''}`}
        onClick={controller.toggleIndex}
      >
        <Hash className="h-4 w-4" />
        <span>{controller.t('canvas.storyboardGroup.index')}</span>
      </UiChipButton>

      <UiChipButton className={styles.chip} onClick={controller.requestStitch}>
        <Combine className="h-4 w-4 text-text-muted" />
        <span>{controller.t('canvas.storyboardGroup.stitch')}</span>
      </UiChipButton>

      <div className="mx-1 h-4 w-px shrink-0 bg-border" />

      <UiChipButton className={styles.chip} onClick={controller.convertToPlain}>
        <Layers className="h-4 w-4 text-text-muted" />
        <span>{controller.t('canvas.storyboardGroup.convertToPlain')}</span>
      </UiChipButton>

      <UiChipButton
        className={`${styles.chip} hover:!bg-warning/10 hover:!text-warning`}
        onClick={controller.ungroup}
      >
        <Unlink2 className="h-4 w-4" />
        <span>{controller.t('canvas.storyboardGroup.ungroup')}</span>
      </UiChipButton>
    </UiPanel>
  );
}
