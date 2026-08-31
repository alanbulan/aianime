// Copyright (c) 2026 AI anime
import {
  useId,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Image as ImageIcon,
  Loader2,
  Settings2,
  WandSparkles,
} from "lucide-react";

import {
  MEDIA_PRIMARY_ACTION_BUTTON_CLASS,
  VIDEO_PROMPT_TEXTAREA_CLASS,
} from "@/modules/production/presentation/media-styles";
import { MentionTextarea } from "@/modules/mention_textarea/public";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ratioToCss } from "@/shared/aspect-ratio";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import type { BeatVideoGenerationController } from "@/modules/production/application/use-beat-video-generation-controller";
import type { VideoReferenceAssetOperationsController } from "@/modules/production/application/use-video-reference-asset-operations-controller";
import type { BeatVideoConfigController } from "@/modules/production/application/use-beat-video-config-controller";
import type {
  VideoReferenceMentionController,
  VideoReferenceMentionField,
} from "@/modules/production/application/use-video-reference-mention-controller";
import type {
  VideoReferenceAssetItem,
  VideoReferenceBeatStatus,
} from "@/modules/production/domain/video-reference-panel";
import {
  clampDuration,
  normalizeReferenceVideoMode,
  normalizeReferenceVideoRatio,
  normalizeVideoReferenceMode,
  normalizeVideoAspectRatio,
  normalizeVideoResolution,
  referenceVideoResolutionOptionsForDuration,
} from "@/modules/production/domain/video-config";
import { BeatVideoGenerationAction } from "@/modules/production/presentation/BeatVideoGenerationView";
import {
  VideoReferenceAssetsView,
  videoReferenceStatsText,
} from "@/modules/production/presentation/VideoReferenceAssetsView";
import {
  VideoReferenceCheckbox,
  VideoReferenceField,
  VideoReferenceSummaryPill,
} from "@/modules/production/presentation/VideoPaneParts";

const REFERENCE_DRAG_TYPE =
  "application/x-ai-anime-video-reference-reference";
const PROMPT_GUIDANCE_TEMPLATES = [
  {
    key: "subject",
    labelKey: "videoReferenceGuidanceSubject",
    text: "主体：明确画面核心人物或物体、当前动作和状态，避免多个主体争抢焦点。",
  },
  {
    key: "scene",
    labelKey: "videoReferenceGuidanceScene",
    text: "场景：补充空间背景、地点关系、关键道具和环境材质，保持与参考图一致。",
  },
  {
    key: "lighting",
    labelKey: "videoReferenceGuidanceLighting",
    text: "光影：描述主光源、明暗层次、色温和氛围，避免忽明忽暗。",
  },
  {
    key: "camera",
    labelKey: "videoReferenceGuidanceCamera",
    text: "镜头：说明景别、视角、运镜速度和运动方向，保持镜头运动清晰可执行。",
  },
  {
    key: "style",
    labelKey: "videoReferenceGuidanceStyle",
    text: "风格：限定画面质感、时代感、色彩倾向和真实度，避免风格漂移。",
  },
  {
    key: "no_subtitle",
    labelKey: "videoReferenceGuidanceNoSubtitle",
    text: "无字幕：避免生成任何文字或字幕，保持画面纯净。",
  },
] as const;
const CONTROL_CLASS =
  "rounded-[8px] border-border bg-muted text-sm shadow-none focus-visible:border-primary/45 focus-visible:ring-primary/10";
const PILL_ACTION_CLASS =
  "h-6 rounded-full border border-border bg-muted px-2 text-[11px] font-normal text-muted-foreground shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground";
const SEGMENTED_OPTION_CLASS =
  "h-7 rounded-[7px] border px-1.5 text-xs font-normal shadow-none transition-[background-color,border-color,color] duration-150";

export interface BeatVideoConfigViewProps {
  assetOperations: VideoReferenceAssetOperationsController;
  assets: VideoReferenceAssetItem[];
  config: BeatVideoConfigController;
  fallbackAudioReady: boolean;
  fallbackFrameReady: boolean;
  generation: BeatVideoGenerationController;
  hasGeneratedVideo: boolean;
  mediaCandidateCount: number;
  mention: VideoReferenceMentionController;
  modelLabel: string;
  projectAspect: "2:3" | "16:9";
  referencesOpen: boolean;
  savePending: boolean;
  showAudioMediaStatus: boolean;
  showAdvancedVideoConfig: boolean;
  showReferenceVideoConfig: boolean;
  status: VideoReferenceBeatStatus | null;
  onReferencesOpenChange(open: boolean): void;
}

export function BeatVideoConfigView({
  assetOperations,
  assets,
  config,
  fallbackAudioReady,
  fallbackFrameReady,
  generation,
  hasGeneratedVideo,
  mediaCandidateCount,
  mention,
  modelLabel,
  projectAspect,
  referencesOpen,
  savePending,
  showAudioMediaStatus,
  showAdvancedVideoConfig,
  showReferenceVideoConfig,
  status,
  onReferencesOpenChange,
}: BeatVideoConfigViewProps) {
  const { t } = useTranslation();
  const videoReferenceId = useId();
  const draft = config.draft;
  const referenceResolutionOptions = referenceVideoResolutionOptionsForDuration(
    config.referenceResolutionOptions,
    draft.duration,
    config.referenceResolutionMaxSeconds,
  );
  const resolutionOptions = showReferenceVideoConfig
    ? referenceResolutionOptions
    : config.videoResolutionOptions;
  const returnedLastFrameAsset =
    assets.find((asset) => {
      if (asset.media_type !== "image" || !(asset.url || asset.path)) {
        return false;
      }
      return [
        "returned_last_frame",
        "return_last_frame",
        "last_frame_output",
      ].includes(asset.key);
    }) ?? null;
  const returnedLastFrameSrc =
    draft.return_last_frame && returnedLastFrameAsset
      ? resolveMediaUrl(
          returnedLastFrameAsset.url || returnedLastFrameAsset.path,
        )
      : null;
  const returnedLastFrameAspect = ratioToCss(
    draft.ratio || projectAspect,
  );
  const promptStatus = config.ready
    ? t("episode.workbench.video.videoReferenceReady")
    : t("episode.workbench.video.videoReferenceMissing");

  const rememberSelection = (
    field: VideoReferenceMentionField,
    target: HTMLTextAreaElement,
  ) => {
    mention.rememberSelection(field, {
      start: target.selectionStart,
      end: target.selectionEnd,
    });
  };
  const handleReferenceDragStart = (
    event: DragEvent<HTMLElement>,
    label: string,
  ) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(REFERENCE_DRAG_TYPE, label);
    event.dataTransfer.setData("text/plain", `@${label}`);
  };
  const handleReferenceDragOver = (
    event: DragEvent<HTMLTextAreaElement>,
  ) => {
    const types = Array.from(event.dataTransfer.types);
    const mayBeReferenceDrop =
      mention.referenceOptions.length > 0 &&
      (types.length === 0 ||
        types.includes(REFERENCE_DRAG_TYPE) ||
        types.includes("text/plain") ||
        types.includes("text/uri-list") ||
        types.includes("text/html"));
    if (mayBeReferenceDrop) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };
  const handleReferenceDrop = (
    field: VideoReferenceMentionField,
    event: DragEvent<HTMLTextAreaElement>,
  ) => {
    const customLabel = event.dataTransfer.getData(REFERENCE_DRAG_TYPE);
    const plainLabel = event.dataTransfer
      .getData("text/plain")
      .replace(/^@/, "");
    const label = (customLabel || plainLabel).trim();
    if (!mention.acceptsReference(label)) return;
    event.preventDefault();
    const selection =
      document.activeElement === event.currentTarget
        ? {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          }
        : undefined;
    mention.insertDroppedReference(field, label, selection);
  };
  const handleMentionKeyDown = (
    field: VideoReferenceMentionField,
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    mention.setActiveField(field);
    if (!mention.mentionOpen || event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        mention.moveActiveIndex(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        mention.moveActiveIndex(-1);
        break;
      case "Enter":
      case "Tab":
      case " ":
        if (event.key === "Enter" && event.shiftKey) return;
        if (mention.selectActiveMention(field)) event.preventDefault();
        break;
      case "Escape":
        event.preventDefault();
        mention.dismissMention(field);
        break;
    }
  };
  const renderReferenceControls = (field: VideoReferenceMentionField) => {
    if (mention.activeField !== field) return null;
    if (mention.mentionOpen) {
      return (
        <div className="rounded-[8px] border border-border bg-muted p-1.5">
          <div className="mb-1 text-[10px] font-medium text-muted-foreground/78">
            {t("episode.workbench.video.videoReferenceMentionCandidates")}
          </div>
          <div className="flex flex-wrap gap-1">
            {mention.mentionOptions.map((asset, index) => (
              <Button
                key={asset.key}
                type="button"
                size="xs"
                variant="ghost"
                aria-pressed={index === mention.activeIndex}
                className={cn(
                  "h-6 rounded-[6px] border px-1.5 text-[10px] font-normal shadow-none",
                  index === mention.activeIndex
                    ? "border-primary/35 bg-primary/[0.10] text-primary hover:bg-primary/[0.14] hover:text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:bg-accent hover:text-foreground",
                )}
                onMouseEnter={() => mention.setActiveIndex(index)}
                onClick={() =>
                  mention.selectMention(field, asset.reference_label)
                }
              >
                @{asset.reference_label}
              </Button>
            ))}
          </div>
        </div>
      );
    }
    if (mention.referenceOptions.length <= 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground/78">
          {t("episode.workbench.video.videoReferenceAtReferences")}
        </span>
        {mention.referenceOptions.map((asset) => (
          <Button
            key={asset.key}
            type="button"
            size="xs"
            variant="ghost"
            className={PILL_ACTION_CLASS}
            onClick={() =>
              mention.appendReference(field, asset.reference_label)
            }
          >
            @{asset.reference_label}
          </Button>
        ))}
      </div>
    );
  };

  return (
    <div className="col-span-2 space-y-4 rounded-[10px] border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Settings2 className="size-3.5 text-muted-foreground/78" />
        <Label className="text-xs font-medium text-foreground/82">
          {modelLabel
            ? `${modelLabel} 检视器`
            : t("episode.workbench.video.videoReferenceInspector")}
        </Label>
        <VideoReferenceSummaryPill
          active={status?.media.render_ready ?? fallbackFrameReady}
          label={t("episode.workbench.video.renderReady")}
        />
        {showAudioMediaStatus && (
          <VideoReferenceSummaryPill
            active={status?.media.audio_ready ?? fallbackAudioReady}
            label={t("episode.workbench.video.audioReady")}
          />
        )}
        <VideoReferenceSummaryPill active={config.ready} label={promptStatus} />
        {showAdvancedVideoConfig && (
          <VideoReferenceSummaryPill
            active={status?.voice.ready ?? false}
            attention={Boolean(status?.voice.required && !status.voice.ready)}
            detail={status?.voice.detail}
            label={
              status?.voice.label ??
              t("episode.workbench.video.narratorVoiceMissing")
            }
          />
        )}
        <span className="inline-flex h-5 max-w-full items-center rounded-full border border-border bg-muted px-2 text-[11px] leading-none text-muted-foreground">
          {videoReferenceStatsText(t, {
            fallbacks: status?.assets.fallbacks ?? 0,
            invalid: status?.assets.invalid ?? 0,
            missing: status?.assets.missing ?? 0,
            selected: status?.assets.selected ?? 0,
            unused: status?.assets.unused ?? 0,
          })}
        </span>
        <span className="inline-flex h-5 max-w-full items-center rounded-full border border-border bg-muted px-2 text-[11px] leading-none text-muted-foreground">
          {t("episode.workbench.video.videoVersions", {
            count: mediaCandidateCount,
          })}
        </span>
      </div>

      <VideoReferenceAssetsView
        assets={assets}
        controller={assetOperations}
        imageOnly={showReferenceVideoConfig}
        invalidCount={status?.assets.invalid ?? 0}
        fallbackCount={status?.assets.fallbacks ?? 0}
        missingCount={status?.assets.missing ?? 0}
        mode={draft.mode}
        open={referencesOpen}
        selectedCount={status?.assets.selected ?? 0}
        unusedCount={status?.assets.unused ?? 0}
        onOpenChange={onReferencesOpenChange}
        onReferenceDragStart={handleReferenceDragStart}
      />

      <div className="grid gap-3 rounded-[10px] border border-border bg-card p-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <VideoReferenceField
          label={t("episode.workbench.video.mode")}
          htmlFor={`${videoReferenceId}-mode`}
        >
          <Select
            value={draft.mode}
            onValueChange={(value) =>
              config.updateMode(
                showReferenceVideoConfig
                  ? normalizeReferenceVideoMode(value)
                  : normalizeVideoReferenceMode(value),
              )
            }
          >
            <SelectTrigger
              id={`${videoReferenceId}-mode`}
              className={cn("!h-9", CONTROL_CLASS)}
            >
              <span
                data-slot="select-value"
                className="flex flex-1 items-center gap-1.5 text-left"
              >
                {t(
                  `episode.workbench.video.videoReferenceModeLabels.${
                    showReferenceVideoConfig
                      ? normalizeReferenceVideoMode(draft.mode)
                      : draft.mode
                  }`,
                )}
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {(showReferenceVideoConfig
                ? (["first_frame", "multimodal_reference"] as const)
                : config.videoModeOptions
              ).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(
                    `episode.workbench.video.videoReferenceModeLabels.${mode}`,
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </VideoReferenceField>
        <VideoReferenceField
          label={t("episode.workbench.video.duration")}
          htmlFor={`${videoReferenceId}-duration`}
        >
          <Input
            id={`${videoReferenceId}-duration`}
            aria-label={t("episode.workbench.video.duration")}
            type="number"
            min={config.videoDurationBounds.min}
            max={config.videoDurationBounds.max}
            value={draft.duration}
            onChange={(event) => {
              const duration = clampDuration(
                event.target.value,
                config.videoDurationBounds,
              );
              config.changeDraft((current) => ({
                ...current,
                duration,
                ...(showReferenceVideoConfig
                  && !referenceVideoResolutionOptionsForDuration(
                    config.referenceResolutionOptions,
                    duration,
                    config.referenceResolutionMaxSeconds,
                  ).includes(current.resolution)
                  ? {
                      resolution:
                        referenceVideoResolutionOptionsForDuration(
                          config.referenceResolutionOptions,
                          duration,
                          config.referenceResolutionMaxSeconds,
                        )[0] ?? current.resolution,
                    }
                  : {}),
              }));
            }}
            className={cn("!h-9", CONTROL_CLASS)}
          />
        </VideoReferenceField>
        {resolutionOptions.length ? (
          <VideoReferenceField
            label={t("episode.workbench.video.resolution")}
            htmlFor={`${videoReferenceId}-resolution`}
          >
            <Select
              value={draft.resolution}
              onValueChange={(value) =>
                config.updateDraft(
                  "resolution",
                  normalizeVideoResolution(value, resolutionOptions[0]),
                )
              }
            >
              <SelectTrigger
                id={`${videoReferenceId}-resolution`}
                className={cn("!h-9", CONTROL_CLASS)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {resolutionOptions.map((resolution) => (
                  <SelectItem key={resolution} value={resolution}>
                    {resolution.includes("x")
                      ? resolution.replace("x", " × ")
                      : resolution}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </VideoReferenceField>
        ) : null}
        <VideoReferenceField
          label={t("episode.workbench.video.ratio")}
          htmlFor={`${videoReferenceId}-ratio`}
        >
          <Select
            value={draft.ratio}
            onValueChange={(value) =>
              config.updateDraft(
                "ratio",
                showReferenceVideoConfig
                  ? normalizeReferenceVideoRatio(
                      value,
                      config.referenceRatioOptions,
                    )
                  : normalizeVideoAspectRatio(value),
              )
            }
          >
            <SelectTrigger
              id={`${videoReferenceId}-ratio`}
              className={cn("!h-9", CONTROL_CLASS)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {(showReferenceVideoConfig
                ? config.referenceRatioOptions
                : config.videoRatioOptions
              ).map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </VideoReferenceField>
      </div>

      <p
        data-testid="video-generation-mode-description"
        className="px-1 text-[11px] leading-5 text-muted-foreground"
      >
        {t(
          `episode.workbench.video.videoReferenceModeDescriptions.${
            showReferenceVideoConfig
              ? normalizeReferenceVideoMode(draft.mode)
              : draft.mode
          }`,
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-muted-foreground">
        {showAdvancedVideoConfig && (
          <VideoReferenceCheckbox
            id={`${videoReferenceId}-return-last-frame`}
            checked={draft.return_last_frame}
            label={t("episode.workbench.video.returnLastFrame")}
            onChange={(checked) =>
              config.updateDraft("return_last_frame", checked)
            }
          />
        )}
        {config.supportsSceneOptimize && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/80">
              {t("episode.workbench.video.videoReferenceGuidanceStyle")}
            </span>
            <div
              role="radiogroup"
              aria-label={t(
                "episode.workbench.video.videoReferenceGuidanceStyle",
              )}
              className="inline-flex items-center gap-1"
            >
              {(["anime", "realistic"] as const).map((style) => {
                const active = draft.scene_optimize === style;
                return (
                  <button
                    key={style}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={cn(
                      SEGMENTED_OPTION_CLASS,
                      active
                        ? "border-primary/45 bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground hover:border-foreground/25 hover:bg-accent hover:text-foreground",
                    )}
                    onClick={() =>
                      config.updateDraft("scene_optimize", style)
                    }
                  >
                    {t(
                      `episode.workbench.video.videoReferenceSceneOptimizeLabels.${style}`,
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showAdvancedVideoConfig && draft.return_last_frame && (
        <div
          data-video-reference-returned-last-frame
          data-testid="video-reference-returned-last-frame-panel"
          className="inline-flex w-fit max-w-full flex-col rounded-[8px] border border-border bg-card p-1.5"
        >
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <ImageIcon className="size-3" />
            <span>{t("episode.workbench.video.returnLastFrame")}</span>
            {returnedLastFrameSrc && returnedLastFrameAsset && (
              <a
                href={returnedLastFrameSrc}
                download
                className="ml-auto inline-flex h-6 items-center gap-1 rounded-[6px] border border-border bg-muted px-2 text-[10px] text-foreground/78 hover:border-foreground/25 hover:bg-accent hover:text-foreground"
              >
                <Download className="size-3" />
                {t("common.download")}
              </a>
            )}
          </div>
          <div
            data-testid="video-reference-returned-last-frame-box"
            className={cn(
              "relative w-[7.5rem] max-w-full overflow-hidden rounded-[7px] bg-muted",
              returnedLastFrameSrc && returnedLastFrameAsset
                ? "border border-border"
                : "border border-dashed border-border",
            )}
            style={{ aspectRatio: returnedLastFrameAspect }}
          >
            {returnedLastFrameSrc && returnedLastFrameAsset ? (
              <img
                src={returnedLastFrameSrc}
                alt={returnedLastFrameAsset.label}
                className="absolute inset-0 h-full w-full object-contain"
                decoding="async"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-[10px] text-muted-foreground/72">
                <ImageIcon className="size-5 opacity-60" />
                <span>
                  {t("episode.workbench.video.returnLastFramePending")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        data-testid="video-reference-prompt-panel"
        className="rounded-[10px] border border-border bg-card p-3"
      >
        <div className="grid gap-3">
          <VideoReferenceField
            label={t("episode.workbench.video.videoReferencePromptGuidance")}
            htmlFor={`${videoReferenceId}-prompt-guidance`}
          >
            <MentionTextarea
              id={`${videoReferenceId}-prompt-guidance`}
              aria-label={t(
                "episode.workbench.video.videoReferencePromptGuidance",
              )}
              value={draft.prompt_guidance}
              onChange={(event) => {
                config.updateDraft("prompt_guidance", event.target.value);
                rememberSelection("prompt_guidance", event.currentTarget);
              }}
              onFocus={(event) =>
                rememberSelection("prompt_guidance", event.currentTarget)
              }
              onKeyDown={(event) =>
                handleMentionKeyDown("prompt_guidance", event)
              }
              onKeyUp={(event) =>
                rememberSelection("prompt_guidance", event.currentTarget)
              }
              onMouseUp={(event) =>
                rememberSelection("prompt_guidance", event.currentTarget)
              }
              onSelect={(event) =>
                rememberSelection("prompt_guidance", event.currentTarget)
              }
              onDragOver={handleReferenceDragOver}
              onDrop={(event) =>
                handleReferenceDrop("prompt_guidance", event)
              }
              mentionLabels={mention.mentionLabels}
              mentionPreviews={mention.mentionPreviews}
              rows={2}
              className={cn(
                "min-h-[72px]",
                VIDEO_PROMPT_TEXTAREA_CLASS,
              )}
            />
          </VideoReferenceField>
          {renderReferenceControls("prompt_guidance")}
          <div className="flex flex-wrap gap-1.5">
            {PROMPT_GUIDANCE_TEMPLATES.map((template) => (
              <Button
                key={template.key}
                type="button"
                size="xs"
                variant="ghost"
                disabled={savePending}
                className={PILL_ACTION_CLASS}
                onClick={() =>
                  mention.appendGuidanceTemplate(template.text)
                }
              >
                {t(`episode.workbench.video.${template.labelKey}`)}
              </Button>
            ))}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label
                htmlFor={`${videoReferenceId}-prompt`}
                className="text-[11px] text-muted-foreground/78"
              >
                {showReferenceVideoConfig
                  ? "主体提示词"
                  : t("episode.workbench.video.videoReferencePrompt")}
              </Label>
            </div>
            <MentionTextarea
              id={`${videoReferenceId}-prompt`}
              aria-label={t("episode.workbench.video.videoReferencePrompt")}
              value={draft.final_prompt}
              onChange={(event) => {
                config.updateDraft("final_prompt", event.target.value);
                rememberSelection("final_prompt", event.currentTarget);
              }}
              onFocus={(event) =>
                rememberSelection("final_prompt", event.currentTarget)
              }
              onKeyDown={(event) =>
                handleMentionKeyDown("final_prompt", event)
              }
              onKeyUp={(event) =>
                rememberSelection("final_prompt", event.currentTarget)
              }
              onMouseUp={(event) =>
                rememberSelection("final_prompt", event.currentTarget)
              }
              onSelect={(event) =>
                rememberSelection("final_prompt", event.currentTarget)
              }
              onDragOver={handleReferenceDragOver}
              onDrop={(event) =>
                handleReferenceDrop("final_prompt", event)
              }
              mentionLabels={mention.mentionLabels}
              mentionPreviews={mention.mentionPreviews}
              rows={2}
              className={cn(
                "min-h-[72px]",
                VIDEO_PROMPT_TEXTAREA_CLASS,
              )}
            />
            {renderReferenceControls("final_prompt")}
          </div>
          <div className="flex flex-wrap justify-start gap-2 pt-1">
            <Button
              size="xs"
              variant="outline"
              disabled={config.promptPending}
              onClick={() => void config.generatePrompt()}
              className={MEDIA_PRIMARY_ACTION_BUTTON_CLASS}
            >
              {config.promptPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <WandSparkles className="size-3" />
              )}
              {showReferenceVideoConfig
                ? "生成主体提示词"
                : t("episode.workbench.video.videoReferenceGeneratePrompt")}
            </Button>
            <BeatVideoGenerationAction
              className={MEDIA_PRIMARY_ACTION_BUTTON_CLASS}
              controller={generation}
              hasGeneratedVideo={hasGeneratedVideo}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
