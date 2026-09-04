// Copyright (c) 2026 AI anime
import { ChevronDown, LayoutGrid, Palette, Unlink2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UiChipButton } from "@/components/ui";
import type { GroupNodeToolbarController } from "@/modules/creative_canvas/presentation/useGroupNodeToolbarController";

export interface GroupNodeToolbarStyleClasses {
  menuContent: string;
  menuItem: string;
  textButton: string;
}

export interface GroupNodeToolbarActionsViewProps {
  controller: GroupNodeToolbarController;
  styles: GroupNodeToolbarStyleClasses;
}

export function GroupNodeToolbarActionsView({
  controller,
  styles,
}: GroupNodeToolbarActionsViewProps) {
  const {
    t,
    backgroundColor,
    colorPresets,
    setBackgroundColor,
    arrange,
    ungroup,
  } = controller;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <UiChipButton
            className={styles.textButton}
            data-ui-tooltip="组背景色"
            onClick={(event) => event.stopPropagation()}
          >
            {backgroundColor ? (
              <span
                className="h-3.5 w-3.5 rounded-full border border-border"
                style={{ backgroundColor }}
              />
            ) : (
              <Palette className="h-3.5 w-3.5" />
            )}
            背景色
            <ChevronDown className="h-3 w-3" />
          </UiChipButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className={styles.menuContent}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid grid-cols-5 gap-1.5 p-1.5">
            <button
              type="button"
              data-ui-tooltip="无"
              onClick={() => setBackgroundColor(null)}
              className={`relative flex h-6 w-6 items-center justify-center rounded-full border bg-transparent transition-transform hover:scale-110 ${
                backgroundColor
                  ? "border-border"
                  : "border-primary ring-1 ring-primary/50"
              }`}
            >
              <span className="absolute h-[1.5px] w-4 rotate-45 rounded bg-destructive/80" />
            </button>
            {colorPresets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                data-ui-tooltip={preset.label}
                onClick={() => setBackgroundColor(preset.value)}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  backgroundColor === preset.value
                    ? "border-primary ring-1 ring-primary/50"
                    : "border-border"
                }`}
                style={{ backgroundColor: preset.value }}
              />
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <UiChipButton
            className={styles.textButton}
            data-ui-tooltip="排列方式"
            onClick={(event) => event.stopPropagation()}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            排列
            <ChevronDown className="h-3 w-3" />
          </UiChipButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className={`${styles.menuContent} min-w-[120px]`}
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem
            className={styles.menuItem}
            onClick={() => arrange("grid")}
          >
            网格
          </DropdownMenuItem>
          <DropdownMenuItem
            className={styles.menuItem}
            onClick={() => arrange("horizontal")}
          >
            横向排列
          </DropdownMenuItem>
          <DropdownMenuItem
            className={styles.menuItem}
            onClick={() => arrange("vertical")}
          >
            纵向排列
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UiChipButton
        className={`${styles.textButton} hover:!border-warning/50 hover:!bg-warning/10 hover:!text-warning`}
        onClick={(event) => {
          event.stopPropagation();
          ungroup();
        }}
      >
        <Unlink2 className="h-3.5 w-3.5" />
        {t("nodeToolbar.ungroup")}
      </UiChipButton>
    </>
  );
}
