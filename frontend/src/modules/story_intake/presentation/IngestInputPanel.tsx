// Copyright (c) 2026 AI anime
import { motion } from "framer-motion";
import { CheckCircle2, Info, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ETHNICITY_OPTIONS,
  NARRATION_STYLE_OPTIONS,
  SPINE_TEMPLATE_OPTIONS,
} from "@/modules/story_intake/application/options";
import type { StoryIntakeController } from "@/modules/story_intake/application/use-story-intake-controller";
import { PASTE_TEXT_MAX_LENGTH } from "@/modules/story_intake/domain/ingestion";
import {
  COMPACT_SELECT_CONTENT_CLASS,
  COMPACT_SELECT_TRIGGER_CLASS,
  FormatCheckWarning,
  IngestStartButton,
  InputModeToggle,
  SelectedFileCard,
  UploadZone,
} from "@/modules/story_intake/presentation/IngestPageParts";

export function IngestInputPanel({
  controller,
}: {
  controller: StoryIntakeController;
}) {
  const { t } = useTranslation();
  const {
    uploadedFile,
    inputMode,
    setInputMode,
    setNovelFormatOpen,
    pastedText,
    setPastedText,
    ingestFileStatus,
    ingestError,
    setFormatCheckDetails,
    uploadMutation,
    startIngestMutation,
    ingestFeatureCostDisplay,
    ingestStarted,
    visualStyleOptions,
    settingsValues,
    settingsChanged,
    spineTemplateLabel,
    spineTemplateLocked,
    showNarrationStyle,
    updateProject,
    handleFieldChange,
    handleFile,
    handleDeleteFile,
    handleSaveSettings,
    handleStartIngest,
    canStartFromCurrentInput,
    sourceHint,
    isStarting,
  } = controller;

  return (
    <motion.section
      layout
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl bg-muted p-4"
    >
      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out",
          inputMode === "upload"
            ? "grid-rows-[188px]"
            : "grid-rows-[198px]",
        )}
      >
        <div className="relative min-h-0">
          <div
            className={cn(
              "absolute inset-0 transition-all duration-200 ease-out",
              inputMode === "upload"
                ? "translate-y-0 opacity-100"
                : "-translate-y-1 opacity-0 pointer-events-none",
            )}
            aria-hidden={inputMode !== "upload"}
          >
            {uploadedFile ? (
              <SelectedFileCard
                filename={uploadedFile.filename}
                error={ingestFileStatus === "failed" ? ingestError : null}
                onDelete={handleDeleteFile}
              />
          ) : (
<UploadZone
                onFile={handleFile}
                pending={uploadMutation.isPending}
                className="h-full border-0 bg-transparent py-10 hover:border-transparent hover:bg-transparent"
              />
            )}
          </div>
          <div
            className={cn(
              "absolute inset-0 px-2 py-3 transition-all duration-200 ease-out",
              inputMode === "paste"
                ? "translate-y-0 opacity-100"
                : "translate-y-1 opacity-0 pointer-events-none",
            )}
            aria-hidden={inputMode !== "paste"}
          >
            <Textarea
              value={pastedText}
              onChange={(event) =>
                setPastedText(
                  event.target.value.slice(0, PASTE_TEXT_MAX_LENGTH),
                )
              }
              maxLength={PASTE_TEXT_MAX_LENGTH}
              placeholder={t("ingest.pastePlaceholder")}
              className="h-[152px] resize-none rounded-[10px] border-border bg-muted p-4 text-sm leading-6 placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10 md:text-sm [field-sizing:fixed]"
            />
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs leading-4 text-muted-foreground/70">
              <span className="min-w-0 truncate">{sourceHint}</span>
              <span className="shrink-0 tabular-nums">
                {pastedText.length}/{PASTE_TEXT_MAX_LENGTH}
              </span>
            </div>
          </div>
        </div>
      </div>
      {inputMode === "upload" && (
        <div className="mt-1.5 min-h-4 px-1 text-xs leading-4 text-muted-foreground/70">
          {uploadedFile?.format_check?.level === "warning" ? (
            // 格式风险常驻在提示行（紧邻「开始导入」决策区），替代一闪而过的 toast。
            <FormatCheckWarning
              formatCheck={uploadedFile.format_check}
              variant="plain"
              onViewDetails={() => {
                if (!uploadedFile.format_check) return;
                setFormatCheckDetails({
                  formatCheck: uploadedFile.format_check,
                  filename: uploadedFile.filename,
                });
              }}
            />
          ) : (
            sourceHint
          )}
        </div>
      )}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 px-1 md:flex md:items-center md:gap-3">
        <InputModeToggle
          value={inputMode}
          onChange={setInputMode}
          className="col-span-2 w-full md:w-auto"
        />

        {spineTemplateLocked ? (
          <span
            className="inline-flex w-full md:w-auto"
            data-ui-tooltip={t("ingest.projectTypeLocked")}
          >
            <Select value={settingsValues.spine_template} disabled>
              <SelectTrigger
                className={cn(COMPACT_SELECT_TRIGGER_CLASS, "opacity-70")}
                aria-label={`${t("ingest.projectType")}: ${t(spineTemplateLabel)}`}
              >
                <SelectValue>
                  {(val: string) => {
                    const opt = SPINE_TEMPLATE_OPTIONS.find(
                      (o) => o.value === val,
                    );
                    return opt ? t(opt.labelKey) : t(spineTemplateLabel);
                  }}
                </SelectValue>
              </SelectTrigger>
            </Select>
          </span>
        ) : (
          <Select
            value={settingsValues.spine_template}
            onValueChange={(val) =>
              handleFieldChange("spine_template", val ?? undefined)
            }
          >
            <SelectTrigger className={COMPACT_SELECT_TRIGGER_CLASS}>
              <SelectValue placeholder={t("ingest.projectType")}>
                {(val: string) => {
                  const opt = SPINE_TEMPLATE_OPTIONS.find(
                    (o) => o.value === val,
                  );
                  return opt ? t(opt.labelKey) : val;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              alignItemWithTrigger={false}
              sideOffset={8}
              className={COMPACT_SELECT_CONTENT_CLASS}
            >
              {SPINE_TEMPLATE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={settingsValues.visual_style}
          onValueChange={(val) =>
            handleFieldChange("visual_style", val ?? undefined)
          }
        >
          <SelectTrigger className={COMPACT_SELECT_TRIGGER_CLASS}>
            <SelectValue placeholder={t("ingest.selectPlaceholder")}>
              {(val: string) => {
                const opt = visualStyleOptions.find(
                  (o) => o.value === val,
                );
                return opt ? opt.label : val;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            alignItemWithTrigger={false}
            sideOffset={8}
            className={COMPACT_SELECT_CONTENT_CLASS}
          >
            {visualStyleOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showNarrationStyle && (
          <Select
            value={settingsValues.narration_style}
            onValueChange={(val) =>
              handleFieldChange("narration_style", val ?? undefined)
            }
          >
            <SelectTrigger className={COMPACT_SELECT_TRIGGER_CLASS}>
              <SelectValue placeholder={t("ingest.selectPlaceholder")}>
                {(val: string) => {
                  const opt = NARRATION_STYLE_OPTIONS.find(
                    (o) => o.value === val,
                  );
                  return opt ? t(opt.labelKey) : val;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              alignItemWithTrigger={false}
              sideOffset={8}
              className={COMPACT_SELECT_CONTENT_CLASS}
            >
              {NARRATION_STYLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={settingsValues.ethnicity}
          onValueChange={(val) =>
            handleFieldChange("ethnicity", val ?? undefined)
          }
        >
          <SelectTrigger className={COMPACT_SELECT_TRIGGER_CLASS}>
            <SelectValue placeholder={t("ingest.selectPlaceholder")}>
              {(val: string) => {
                const opt = ETHNICITY_OPTIONS.find(
                  (o) => o.value === val,
                );
                return opt ? t(opt.labelKey) : val;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            alignItemWithTrigger={false}
            sideOffset={8}
            className={COMPACT_SELECT_CONTENT_CLASS}
          >
            {ETHNICITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 导入标准格式只对精品剧成立，解说剧走的是另一套解析。 */}
        {settingsValues.spine_template === "drama" && (
          <button
            type="button"
            onClick={() => setNovelFormatOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground [&:hover>span]:underline"
          >
            <Info className="size-3.5 shrink-0" />
            <span>{t("ingest.novelFormat.button")}</span>
          </button>
        )}

        <div className="col-span-2 flex w-full shrink-0 items-center justify-end gap-3 md:ml-auto md:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveSettings}
            disabled={!settingsChanged || updateProject.isPending || ingestStarted}
            className="h-8 gap-1.5 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none transition-colors hover:bg-muted"
          >
            {updateProject.isPending && !startIngestMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3" />
            )}
            {updateProject.isPending && !startIngestMutation.isPending
              ? t("ingest.processing")
              : t("ingest.saveSettings")}
          </Button>

          <IngestStartButton
            onClick={handleStartIngest}
            disabled={
              !canStartFromCurrentInput ||
              uploadMutation.isPending ||
              isStarting ||
              ingestStarted
            }
            isBusy={isStarting || ingestStarted}
            costDisplay={ingestFeatureCostDisplay}
          />
        </div>
      </div>
    </motion.section>
  );
}
