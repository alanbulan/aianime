// Copyright (c) 2026 AI anime
import { useState, type ElementType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Mic2,
  Pencil,
  Video,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { SaveStatus } from "@/components/save-status";
import { UI_CONTENT_OVERLAY_INSET_CLASS } from "@/components/ui/motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEscapeToClose } from "@/shared/hooks/use-escape-to-close";
import { cn } from "@/lib/utils";
import {
  WORKBENCH_SELECT_CONTENT_CLASS,
  WORKBENCH_SELECT_ITEM_CLASS,
} from "@/lib/workbench-select-styles";
import type {
  SectionId,
  SingleBeatPanelController,
  VideoModelHeaderOption,
} from "@/modules/narrative_planning/application/use-single-beat-panel-controller";

export interface SingleBeatPanelViewProps {
  controller: SingleBeatPanelController;
  renderSectionContent(
    id: SectionId,
    onPreview: (url: string) => void,
  ): ReactNode;
}

const SECTION_DEFINITIONS: Record<
  SectionId,
  { icon: ElementType; labelKey: string }
> = {
  text: { icon: FileText, labelKey: "episode.beat.sectionText" },
  sketch: { icon: Pencil, labelKey: "episode.beat.sectionSketch" },
  render: { icon: ImageIcon, labelKey: "episode.beat.sectionRender" },
  audio: { icon: Mic2, labelKey: "episode.beat.sectionAudio" },
  video: { icon: Video, labelKey: "episode.beat.sectionVideo" },
};

const SECTION_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export function SingleBeatPanelView({
  controller,
  renderSectionContent,
}: SingleBeatPanelViewProps) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEscapeToClose(previewUrl !== null, () => setPreviewUrl(null));
  const {
    beatTextScope,
    onDefaultModelChange,
    onToggleSection,
    sections,
    textSaveStatus,
    videoModel,
    videoModels,
  } = controller;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sections.map(({ id, isOpen, ready, statusKey }) => {
          const { icon: Icon, labelKey } = SECTION_DEFINITIONS[id];
          return (
            <div key={id}>
              <div
                className={cn(
                  "sticky top-0 z-20 flex min-h-11 items-center border-b border-border bg-background text-sm font-semibold text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground",
                  isOpen && "bg-muted text-foreground/90",
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggleSection(id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-muted-foreground/55 transition-transform",
                      !isOpen && "-rotate-90",
                      isOpen && "text-muted-foreground/75",
                    )}
                  />
                  <Icon
                    className={cn(
                      "size-4",
                      isOpen ? "text-primary" : "text-muted-foreground/85",
                    )}
                  />
                  <span
                    className={cn(
                      "font-semibold tracking-tight",
                      isOpen ? "text-foreground" : "text-foreground/90",
                    )}
                  >
                    {t(labelKey)}
                  </span>
                </button>
                {id === "video" && (
                  <VideoModelHeaderSelect
                    models={videoModels}
                    onChange={onDefaultModelChange}
                    value={videoModel}
                  />
                )}
                <span
                  className={cn(
                    "mr-3 inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[10px] font-normal",
                    ready
                      ? "border-primary/18 bg-primary/[0.09] text-primary"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {id === "text" && (
                    <SaveStatus scope={beatTextScope} variant="inline" />
                  )}
                  {id === "text" &&
                    textSaveStatus !== "saving" &&
                    textSaveStatus !== "error" &&
                    statusKey === "episode.beat.edited" && (
                      <Check className="size-2.5 text-primary" />
                    )}
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      ready ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  />
                  {t(statusKey)}
                </span>
              </div>
              <AnimatedSectionContent open={isOpen}>
                <div className="border-b border-border bg-card px-3 py-3">
                  {renderSectionContent(id, setPreviewUrl)}
                </div>
              </AnimatedSectionContent>
            </div>
          );
        })}
      </div>

      {previewUrl && (
        <div
          className={cn(
            "fixed z-50 flex items-center justify-center bg-media/90 p-8",
            UI_CONTENT_OVERLAY_INSET_CLASS,
          )}
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            aria-label={t("common.close")}
            className="absolute right-4 top-4 rounded-full bg-background/80 p-2 text-foreground hover:bg-background"
          >
            <X className="size-5" />
          </button>
          <img
            src={previewUrl}
            alt="Preview"
            className="max-h-full max-w-full object-contain"
            decoding="async"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function VideoModelHeaderSelect({
  models,
  onChange,
  value,
}: {
  models: readonly VideoModelHeaderOption[];
  onChange(model: string): void;
  value: string;
}) {
  const { t } = useTranslation();
  const selectedModel = models.find((model) => model.value === value);

  return (
    <div
      className="mr-4 hidden shrink-0 items-center md:flex"
      onClick={(event) => event.stopPropagation()}
    >
      <Select value={value} onValueChange={(next) => onChange(next ?? "")}>
        <SelectTrigger
          aria-label={t("episode.workbench.batch.videoModel")}
          className="!h-[26px] w-auto min-w-[150px] rounded-[7px] border-border bg-muted px-2.5 text-xs font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground focus-visible:border-primary/45 focus-visible:bg-muted focus-visible:ring-primary/10 [&>svg]:ml-1.5 [&>svg]:size-3.5"
        >
          <SelectValue>{() => selectedModel?.label ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          sideOffset={8}
          alignItemWithTrigger={false}
          className={WORKBENCH_SELECT_CONTENT_CLASS}
        >
          {models.map((model) => (
            <SelectItem
              key={model.value}
              value={model.value}
              className={WORKBENCH_SELECT_ITEM_CLASS}
            >
              <span className="flex items-center gap-2">
                {model.label}
                {model.isSeedance2 && (
                  <span className="text-[10px] text-muted-foreground">
                    Seedance2
                  </span>
                )}
                {model.dialogueOnly && (
                  <span className="text-[10px] text-muted-foreground">
                    {t("episode.workbench.video.noteDialogue")}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AnimatedSectionContent({
  children,
  open,
}: {
  children: ReactNode;
  open: boolean;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="section-content"
          initial={reducedMotion ? false : { height: 0, opacity: 0, y: -4 }}
          animate={{ height: "auto", opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -2 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : {
                  height: { duration: 0.4, ease: SECTION_MOTION_EASE },
                  opacity: { duration: 0.4, ease: SECTION_MOTION_EASE },
                  y: { duration: 0.4, ease: SECTION_MOTION_EASE },
                }
          }
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
