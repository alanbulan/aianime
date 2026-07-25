// Copyright (c) 2026 AI anime
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clapperboard } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import type { BeatCardGridController } from "@/modules/narrative_planning/application/use-beat-card-grid-controller";
import type { Beat } from "@/modules/narrative_planning/domain/types";

export interface BeatCardGridViewProps {
  controller: BeatCardGridController;
  insertDialog: ReactNode;
  renderBeatCard(beat: Beat, index: number): ReactNode;
}

export function BeatCardGridView({
  controller,
  insertDialog,
  renderBeatCard,
}: BeatCardGridViewProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useResponsiveColumns(scrollRef);

  useEffect(() => {
    if (controller.selectedBeat === null) return;
    const container = scrollRef.current;
    if (!container) return;
    const card = container.querySelector<HTMLElement>(
      `[data-beat-number="${controller.selectedBeat}"]`,
    );
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [controller.selectedBeat]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4"
    >
      <div
        className="grid gap-3.5"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {controller.beats.map(renderBeatCard)}
      </div>

      {insertDialog}

      <AlertDialog
        open={controller.deleteTarget !== null}
        onOpenChange={controller.onDeleteDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("episode.beat.deleteManualShotTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.beat.deleteManualShotDesc", {
                n: controller.deleteTarget?.displayNumber ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={controller.isDeletePending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void controller.onDeleteManual();
              }}
              disabled={controller.isDeletePending}
              className="border border-destructive/35 bg-destructive/[0.08] text-destructive hover:border-destructive/50 hover:bg-destructive/[0.14] hover:text-destructive"
            >
              {t("episode.beat.deleteManualShot")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {controller.beats.length === 0 && (
        <div className="p-6 text-center text-xs text-muted-foreground">
          {t("episode.workbench.view.noMatchingBeats")}
        </div>
      )}

      {controller.beats.length > 0 && (
        <div
          className="mt-6 mb-2 flex items-center gap-3 px-6 text-muted-foreground"
          aria-hidden
        >
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
          <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
            <Clapperboard className="size-3.5" />
            {t("episode.workbench.endOfBeatsCount", {
              count: controller.beats.length,
            })}
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
        </div>
      )}
    </div>
  );
}
