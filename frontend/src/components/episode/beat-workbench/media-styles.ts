// Copyright (c) 2026 AI anime
export const MEDIA_GRID_CLASS = "grid grid-cols-[minmax(0,2fr)_minmax(220px,3fr)] gap-3";

export const MEDIA_PREVIEW_CLASS =
  "flex min-h-[150px] cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border border-border bg-muted transition-[border-color,background-color,opacity] hover:border-foreground/25 hover:bg-accent hover:opacity-95";

export const MEDIA_PREVIEW_IMAGE_CLASS = "max-h-[180px] w-full object-contain";

export const MEDIA_EMPTY_CLASS =
  "flex h-[150px] items-center justify-center rounded-lg border border-dashed border-border bg-muted text-xs text-muted-foreground";

export const MEDIA_THUMB_CLASS =
  "relative shrink-0 overflow-hidden rounded-[5px] border bg-muted transition-[border-color,background-color,box-shadow,opacity] disabled:opacity-60";

export const MEDIA_THUMB_ACTIVE_CLASS =
  "border-primary/70 bg-primary/[0.06] ring-1 ring-primary/30";

export const MEDIA_THUMB_IDLE_CLASS = "border-border hover:border-primary/55 hover:bg-accent";

export const MEDIA_THUMB_NEW_CLASS =
  "absolute left-0 top-0 rounded-br bg-warning px-1 text-[8px] font-semibold uppercase leading-4 text-warning-foreground";

export const MEDIA_THUMB_TIME_CLASS =
  "absolute bottom-0 left-0 rounded-tr bg-media/75 px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums text-media-foreground/90";

export const MEDIA_THUMB_ACTIVE_MARK_CLASS =
  "absolute bottom-0 right-0 rounded-tl bg-primary px-1 text-[9px] leading-4 text-primary-foreground";

export const CROP_DIALOG_SAVE_BUTTON_CLASS =
  "gap-1 rounded-[8px] border border-primary/35 !bg-primary !text-primary-foreground shadow-none hover:!bg-primary/90 hover:!text-primary-foreground disabled:border-border disabled:!bg-muted disabled:!text-muted-foreground disabled:shadow-none [&_svg]:!text-primary-foreground disabled:[&_svg]:!text-muted-foreground";

export const MEDIA_PRIMARY_ACTION_BUTTON_CLASS =
  "gap-1 rounded-[7px] border-border bg-muted text-foreground/82 shadow-none transition-[background-color,border-color,color,transform] hover:border-foreground/25 hover:bg-accent hover:text-foreground active:scale-95 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/45";
