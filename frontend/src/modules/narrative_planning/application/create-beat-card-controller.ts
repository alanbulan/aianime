// Copyright (c) 2026 AI anime
import { resolveImage } from "@/lib/resolve-image";
import type { Beat } from "@/modules/narrative_planning/domain/types";
import type { PoolImage } from "@/modules/production/public";

export type BeatCardAspectRatio = "portrait" | "landscape";
export type BeatCardMediaKind = "render" | "sketch";

export interface BeatCardControllerOptions {
  aspectRatio: BeatCardAspectRatio;
  assignments: Record<string, string>;
  beat: Beat;
  displayNumber: number;
  images: PoolImage[];
  isChecked: boolean;
  isDeletingManual?: boolean;
  isOpeningFreezone?: boolean;
  isSelected: boolean;
  onCardClick(beatNumber: number): void;
  onCheckboxClick(beatNumber: number): void;
  onDeleteManual?(beatNumber: number, displayNumber: number): void;
  onInsertAfter?(beatNumber: number): void;
  onInsertBefore?(beatNumber: number): void;
  onOpenFreezone?(
    beatNumber: number,
    primarySlot: "sketch" | "frame",
  ): void;
  showRender: boolean;
  showSketch: boolean;
}

export interface BeatCardController {
  aspectRatio: BeatCardAspectRatio;
  beatNumber: number;
  displayNumber: number;
  hasVisibleMedia: boolean;
  isChecked: boolean;
  isDeletingManual: boolean;
  isOpeningFreezone: boolean;
  isSelected: boolean;
  mainImageUrl: string | null;
  mainMediaKind: BeatCardMediaKind;
  onCardClick(): void;
  onCheckboxClick(): void;
  onDeleteManual: (() => void) | null;
  onInsertAfter: (() => void) | null;
  onInsertBefore: (() => void) | null;
  onOpenFreezone: (() => void) | null;
  showSketchOverlay: boolean;
  sketchOverlayUrl: string | null;
  useHorizontalActions: boolean;
}

export function createBeatCardController(
  options: BeatCardControllerOptions,
): BeatCardController {
  const hasVisibleMedia = options.showSketch || options.showRender;
  const dualImage = options.showSketch && options.showRender;
  const sketch = options.showSketch
    ? resolveImage(
        options.images,
        options.assignments,
        options.beat.beat_number,
        "sketch",
        options.beat.sketch_url ?? null,
      )
    : null;
  const render = options.showRender
    ? resolveImage(
        options.images,
        options.assignments,
        options.beat.beat_number,
        "render",
        options.beat.frame_url ?? null,
      )
    : null;
  const mainImage = dualImage
    ? render?.url
      ? render
      : sketch
    : options.showRender
      ? render
      : sketch;
  const mainMediaKind: BeatCardMediaKind = dualImage
    ? render?.url
      ? "render"
      : "sketch"
    : options.showRender
      ? "render"
      : "sketch";
  const beatNumber = options.beat.beat_number;

  return {
    aspectRatio: options.aspectRatio,
    beatNumber,
    displayNumber: options.displayNumber,
    hasVisibleMedia,
    isChecked: options.isChecked,
    isDeletingManual: options.isDeletingManual ?? false,
    isOpeningFreezone: options.isOpeningFreezone ?? false,
    isSelected: options.isSelected,
    mainImageUrl: mainImage?.url ?? null,
    mainMediaKind,
    onCardClick: () => options.onCardClick(beatNumber),
    onCheckboxClick: () => options.onCheckboxClick(beatNumber),
    onDeleteManual:
      options.beat.is_manual_shot && options.onDeleteManual
        ? () => options.onDeleteManual?.(beatNumber, options.displayNumber)
        : null,
    onInsertAfter: options.onInsertAfter
      ? () => options.onInsertAfter?.(beatNumber)
      : null,
    onInsertBefore: options.onInsertBefore
      ? () => options.onInsertBefore?.(beatNumber)
      : null,
    onOpenFreezone: options.onOpenFreezone
      ? () =>
          options.onOpenFreezone?.(
            beatNumber,
            mainMediaKind === "render" ? "frame" : "sketch",
          )
      : null,
    showSketchOverlay: dualImage && mainMediaKind === "render",
    sketchOverlayUrl: sketch?.url ?? null,
    useHorizontalActions: options.aspectRatio === "landscape",
  };
}
