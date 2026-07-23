// Copyright (c) 2026 AI anime
import { FishSymbol } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FormatCheckDetailsDialog } from "@/components/ingest/FormatCheckDetailsDialog";
import { NovelFormatDialog } from "@/components/ingest/NovelFormatDialog";
import type { StoryIntakeController } from "@/modules/story_intake/application/use-story-intake-controller";
import { IngestInputPanel } from "@/modules/story_intake/presentation/IngestInputPanel";
import { IngestResultPanel } from "@/modules/story_intake/presentation/IngestResultPanel";
import { UploadingOverlay } from "@/modules/story_intake/presentation/components/IngestPageParts";

export function IngestPageView({
  controller,
}: {
  controller: StoryIntakeController;
}) {
  const { t } = useTranslation();
  const {
    uploadMutation,
    shouldShowPreview,
    formatCheckDetails,
    setFormatCheckDetails,
    novelFormatOpen,
    setNovelFormatOpen,
  } = controller;

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] flex-col overflow-hidden">
      {uploadMutation.isPending && <UploadingOverlay />}
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-9 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FishSymbol className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {t("ingest.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("ingest.subtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-10">
        <div className="mx-auto w-full max-w-[1080px]">
          {shouldShowPreview ? (
            <IngestResultPanel controller={controller} />
          ) : (
            <IngestInputPanel controller={controller} />
          )}
        </div>
      </div>

      <FormatCheckDetailsDialog
        formatCheck={formatCheckDetails?.formatCheck ?? null}
        filename={formatCheckDetails?.filename}
        open={Boolean(formatCheckDetails)}
        onOpenChange={(next) => {
          if (!next) setFormatCheckDetails(null);
        }}
      />
      <NovelFormatDialog
        open={novelFormatOpen}
        onOpenChange={setNovelFormatOpen}
      />
    </div>
  );
}
