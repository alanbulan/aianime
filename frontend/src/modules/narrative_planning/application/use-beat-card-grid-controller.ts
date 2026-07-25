// Copyright (c) 2026 AI anime
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { Beat } from "@/modules/narrative_planning/domain/types";
import type { PoolImage } from "@/modules/production/public";

export type BeatCardGridToggleId = "text" | "sketch" | "render";
export type BeatCardGridSelection =
  | { mode: "none" }
  | { mode: "single"; beatNum: number }
  | { mode: "multi"; checked: ReadonlySet<number> };
export type BeatCardPrimarySlot = "sketch" | "frame";

export interface BeatCardGridDeleteTarget {
  beatNumber: number;
  displayNumber: number;
}

interface GridsByBeatQuery {
  assignments: Record<string, string>;
  byBeat: Map<number, PoolImage[]>;
}

interface DeleteManualShotMutation {
  isPending: boolean;
  mutateAsync(
    beatNumber: number,
  ): Promise<{ ok: boolean; error?: string }>;
}

export interface BeatCardGridControllerQueries {
  useDeleteManualShot(
    project: string,
    episode: number,
  ): DeleteManualShotMutation;
  useGridsByBeat(project: string, episode: number): GridsByBeatQuery;
}

export interface BeatCardGridControllerDependencies {
  openBeatFreezone(
    project: string,
    request: {
      beat: number;
      episode: number;
      primary_slot: BeatCardPrimarySlot;
      scope: "beat";
    },
  ): Promise<unknown>;
}

export interface BeatCardGridControllerOptions {
  beats: readonly Beat[];
  episode: number;
  project: string;
  selection: BeatCardGridSelection;
  toggles: ReadonlySet<BeatCardGridToggleId>;
}

export interface BeatCardGridController {
  assignments: Record<string, string>;
  beats: readonly Beat[];
  checkedBeats: ReadonlySet<number> | null;
  deleteTarget: BeatCardGridDeleteTarget | null;
  freezonePendingBeat: number | null;
  imagesByBeat: ReadonlyMap<number, PoolImage[]>;
  insertAfterBeat: number | null;
  insertOpen: boolean;
  isDeletePending: boolean;
  onDeleteDialogOpenChange(open: boolean): void;
  onDeleteManual(): Promise<void>;
  onDeleteManualRequest(beatNumber: number, displayNumber: number): void;
  onInsertAfter(beatNumber: number): void;
  onInsertBefore(beatNumber: number): void;
  onInsertOpenChange(open: boolean): void;
  onOpenFreezone(
    beatNumber: number,
    primarySlot: BeatCardPrimarySlot,
  ): Promise<void>;
  selectedBeat: number | null;
  showRender: boolean;
  showSketch: boolean;
}

export function createUseBeatCardGridController(
  queries: BeatCardGridControllerQueries,
  dependencies: BeatCardGridControllerDependencies,
) {
  return function useBeatCardGridController({
    beats,
    episode,
    project,
    selection,
    toggles,
  }: BeatCardGridControllerOptions): BeatCardGridController {
    const { t } = useTranslation();
    const { assignments, byBeat } = queries.useGridsByBeat(project, episode);
    const deleteManualShot = queries.useDeleteManualShot(project, episode);
    const [insertAfterBeat, setInsertAfterBeat] = useState<number | null>(null);
    const [insertOpen, setInsertOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] =
      useState<BeatCardGridDeleteTarget | null>(null);
    const [freezonePendingBeat, setFreezonePendingBeat] = useState<
      number | null
    >(null);

    const onInsertBefore = useCallback(
      (beatNumber: number) => {
        const currentIndex = beats.findIndex(
          (beat) => beat.beat_number === beatNumber,
        );
        setInsertAfterBeat(
          currentIndex <= 0
            ? null
            : beats[currentIndex - 1]?.beat_number ?? null,
        );
        setInsertOpen(true);
      },
      [beats],
    );
    const onInsertAfter = useCallback((beatNumber: number) => {
      setInsertAfterBeat(beatNumber);
      setInsertOpen(true);
    }, []);
    const onInsertOpenChange = useCallback((open: boolean) => {
      setInsertOpen(open);
      if (!open) setInsertAfterBeat(null);
    }, []);
    const onOpenFreezone = useCallback(
      async (
        beatNumber: number,
        primarySlot: BeatCardPrimarySlot,
      ) => {
        if (freezonePendingBeat !== null) return;
        setFreezonePendingBeat(beatNumber);
        try {
          await dependencies.openBeatFreezone(project, {
            scope: "beat",
            episode,
            beat: beatNumber,
            primary_slot: primarySlot,
          });
        } catch {
          toast.error(t("episode.beat.openFreezoneFailed"));
          setFreezonePendingBeat(null);
        }
      },
      [episode, freezonePendingBeat, project, t],
    );
    const onDeleteManual = useCallback(async () => {
      if (!deleteTarget) return;
      try {
        const response = await deleteManualShot.mutateAsync(
          deleteTarget.beatNumber,
        );
        if (!response.ok) {
          toast.error(response.error);
          return;
        }
        toast.success(
          t("episode.beat.deleteManualShotSuccess", {
            n: deleteTarget.displayNumber,
          }),
        );
        setDeleteTarget(null);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.beat.deleteManualShotFailed"),
        );
      }
    }, [deleteManualShot, deleteTarget, t]);
    const onDeleteDialogOpenChange = useCallback(
      (open: boolean) => {
        if (!open && !deleteManualShot.isPending) setDeleteTarget(null);
      },
      [deleteManualShot.isPending],
    );
    const onDeleteManualRequest = useCallback(
      (beatNumber: number, displayNumber: number) => {
        setDeleteTarget({ beatNumber, displayNumber });
      },
      [],
    );

    return {
      assignments,
      beats,
      checkedBeats: selection.mode === "multi" ? selection.checked : null,
      deleteTarget,
      freezonePendingBeat,
      imagesByBeat: byBeat,
      insertAfterBeat,
      insertOpen,
      isDeletePending: deleteManualShot.isPending,
      onDeleteDialogOpenChange,
      onDeleteManual,
      onDeleteManualRequest,
      onInsertAfter,
      onInsertBefore,
      onInsertOpenChange,
      onOpenFreezone,
      selectedBeat:
        selection.mode === "single" ? selection.beatNum : null,
      showRender: toggles.has("render"),
      showSketch: toggles.has("sketch"),
    };
  };
}
