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

import { CreditCostInline } from "@/components/credit-cost-inline";
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
import type { Seedance2AssetOperationsController } from "@/modules/production/application/use-seedance2-asset-operations-controller";
import type { Seedance2ConfigController } from "@/modules/production/application/use-seedance2-config-controller";
import type {
  Seedance2MentionController,
  Seedance2MentionField,
} from "@/modules/production/application/use-seedance2-mention-controller";
import type {
  Seedance2AssetItem,
  Seedance2BeatStatus,
} from "@/modules/production/domain/seedance2-panel";
import {
  clampDuration,
  normalizeGrokVideoRatio,
  normalizeHappyHorseMode,
  normalizeHappyHorseRatio,
  normalizeSeedance2Mode,
  normalizeSeedance2Ratio,
  normalizeSeedance2Resolution,
} from "@/modules/production/domain/video-config";
import { BeatVideoGenerationAction } from "@/modules/production/presentation/BeatVideoGenerationView";
import { Seedance2ReferenceAssetsView } from "@/modules/production/presentation/Seedance2ReferenceAssetsView";
import {
  Seedance2Checkbox,
  Seedance2Field,
  Seedance2SummaryPill,
} from "@/modules/production/presentation/VideoPaneParts";

const REFERENCE_DRAG_TYPE =
  "application/x-ai-anime-seedance2-reference";
const PROMPT_GUIDANCE_TEMPLATES = [
  {
    key: "subject",
    labelKey: "seedance2GuidanceSubject",
    text: "主体：明确画面核心人物或物体、当前动作和状态，避免多个主体争抢焦点。",
  },
  {
    key: "scene",
    labelKey: "seedance2GuidanceScene",
    text: "场景：补充空间背景、地点关系、关键道具和环境材质，保持与参考图一致。",
  },
  {
    key: "lighting",
    labelKey: "seedance2GuidanceLighting",
    text: "光影：描述主光源、明暗层次、色温和氛围，避免忽明忽暗。",
  },
  {
    key: "camera",
    labelKey: "seedance2GuidanceCamera",
    text: "镜头：说明景别、视角、运镜速度和运动方向，保持镜头运动清晰可执行。",
  },
  {
    key: "style",
    labelKey: "seedance2GuidanceStyle",
    text: "风格：限定画面质感、时代感、色彩倾向和真实度，避免风格漂移。",
  },
  {
    key: "no_subtitle",
    labelKey: "seedance2GuidanceNoSubtitle",
    text: "无字幕：避免生成任何文字或字幕，保持画面纯净。",
  },
] as const;
const CONTROL_CLASS =
  "rounded-[8px] border-border bg-muted text-sm shadow-none focus-visible:border-primary/45 focus-visible:ring-primary/10";
const PILL_ACTION_CLASS =
  "h-6 rounded-full border border-border bg-muted px-2 text-[11px] font-normal text-muted-foreground shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground";
const SEGMENTED_OPTION_CLASS =
  "h-7 rounded-[7px] border px-1.5 text-xs font-normal shadow-none transition-[background-color,border-color,color] duration-150";

export interface Seedance2ConfigViewProps {
  assetOperations: Seedance2AssetOperationsController;
  assets: Seedance2AssetItem[];
  config: Seedance2ConfigController;
  fallbackAudioReady: boolean;
  fallbackFrameReady: boolean;
  generation: BeatVideoGenerationController;
  hasGeneratedVideo: boolean;
  mediaCandidateCount: number;
  mention: Seedance2MentionController;
  projectAspect: "2:3" | "16:9";
  referencesOpen: boolean;
  savePending: boolean;
  showAudioMediaStatus: boolean;
  showGrokVideoConfig: boolean;
  showHappyHorseConfig: boolean;
  showSeedance2Config: boolean;
  status: Seedance2BeatStatus | null;
  onReferencesOpenChange(open: boolean): void;
}

export function Seedance2ConfigView({
  assetOperations,
  assets,
  config,
  fallbackAudioReady,
  fallbackFrameReady,
  generation,
  hasGeneratedVideo,
  mediaCandidateCount,
  mention,
  projectAspect,
  referencesOpen,
  savePending,
  showAudioMediaStatus,
  showGrokVideoConfig,
  showHappyHorseConfig,
  showSeedance2Config,
  status,
  onReferencesOpenChange,
}: Seedance2ConfigViewProps) {
  const { t } = useTranslation();
  const seedance2Id = useId();
  const draft = config.draft;
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
    ? t("episode.workbench.video.seedance2Ready")
    : t("episode.workbench.video.seedance2Missing");

  const rememberSelection = (
    field: Seedance2MentionField,
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
    field: Seedance2MentionField,
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
    field: Seedance2MentionField,
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
  const renderReferenceControls = (field: Seedance2MentionField) => {
    if (mention.activeField !== field) return null;
    if (mention.mentionOpen) {
      return (
        <div className="rounded-[8px] border border-border bg-muted p-1.5">
          <div className="mb-1 text-[10px] font-medium text-muted-foreground/78">
            {t("episode.workbench.video.seedance2MentionCandidates")}
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
          {t("episode.workbench.video.seedance2AtReferences")}
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
          {showGrokVideoConfig
            ? "Grok Video 检视器"
            : showHappyHorseConfig
              ? "HappyHorse 检视器"
              : t("episode.workbench.video.seedance2Inspector")}
        </Label>
        <Seedance2SummaryPill
          active={status?.media.render_ready ?? fallbackFrameReady}
          label={t("episode.workbench.video.renderReady")}
        />
        {showAudioMediaStatus && (
          <Seedance2SummaryPill
            active={status?.media.audio_ready ?? fallbackAudioReady}
            label={t("episode.workbench.video.audioReady")}
          />
        )}
        <Seedance2SummaryPill active={config.ready} label={promptStatus} />
        {showSeedance2Config && (
          <Seedance2SummaryPill
            active={status?.voice.ready ?? false}
            label={
              status?.voice.label ??
              t("episode.workbench.video.narratorVoiceMissing")
            }
          />
        )}
        <span className="inline-flex h-5 max-w-full items-center rounded-full border border-border bg-muted px-2 text-[11px] leading-none text-muted-foreground">
          {t("episode.workbench.video.seedance2ReferenceStats", {
            selected: status?.assets.selected ?? 0,
            missing: status?.assets.missing ?? 0,
          })}
        </span>
        <span className="inline-flex h-5 max-w-full items-center rounded-full border border-border bg-muted px-2 text-[11px] leading-none text-muted-foreground">
          {t("episode.workbench.video.videoVersions", {
            count: mediaCandidateCount,
          })}
        </span>
      </div>

      <Seedance2ReferenceAssetsView
        assets={assets}
        controller={assetOperations}
        imageOnly={showHappyHorseConfig || showGrokVideoConfig}
        missingCount={status?.assets.missing ?? 0}
        mode={draft.mode}
        open={referencesOpen}
        selectedCount={status?.assets.selected ?? 0}
        onOpenChange={onReferencesOpenChange}
        onReferenceDragStart={handleReferenceDragStart}
      />

      <div className="grid gap-3 rounded-[10px] border border-border bg-card p-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <Seedance2Field
          label={t("episode.workbench.video.mode")}
          htmlFor={`${seedance2Id}-mode`}
        >
          <Select
            value={draft.mode}
            onValueChange={(value) =>
              config.updateMode(
                showHappyHorseConfig || showGrokVideoConfig
                  ? normalizeHappyHorseMode(value)
                  : normalizeSeedance2Mode(value),
              )
            }
          >
            <SelectTrigger
              id={`${seedance2Id}-mode`}
              className={cn("!h-9", CONTROL_CLASS)}
            >
              <span
                data-slot="select-value"
                className="flex flex-1 items-center gap-1.5 text-left"
              >
                {t(
                  `episode.workbench.video.seedance2ModeLabels.${
                    showHappyHorseConfig || showGrokVideoConfig
                      ? normalizeHappyHorseMode(draft.mode)
                      : draft.mode
                  }`,
                )}
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="first_frame">
                {t(
                  "episode.workbench.video.seedance2ModeLabels.first_frame",
                )}
              </SelectItem>
              {!showHappyHorseConfig && !showGrokVideoConfig && (
                <SelectItem value="first_last_frame">
                  {t(
                    "episode.workbench.video.seedance2ModeLabels.first_last_frame",
                  )}
                </SelectItem>
              )}
              <SelectItem value="multimodal_reference">
                {t(
                  "episode.workbench.video.seedance2ModeLabels.multimodal_reference",
                )}
              </SelectItem>
            </SelectContent>
          </Select>
        </Seedance2Field>
        <Seedance2Field
          label={t("episode.workbench.video.duration")}
          htmlFor={`${seedance2Id}-duration`}
        >
          <Input
            id={`${seedance2Id}-duration`}
            aria-label={t("episode.workbench.video.duration")}
            type="number"
            min={config.seedance2DurationBounds.min}
            max={config.seedance2DurationBounds.max}
            value={draft.duration}
            onChange={(event) =>
              config.updateDraft(
                "duration",
                clampDuration(
                  event.target.value,
                  config.seedance2DurationBounds,
                ),
              )
            }
            className={cn("!h-9", CONTROL_CLASS)}
          />
        </Seedance2Field>
        <Seedance2Field
          label={t("episode.workbench.video.resolution")}
          htmlFor={`${seedance2Id}-resolution`}
        >
          <Select
            value={draft.resolution}
            onValueChange={(value) =>
              config.updateDraft(
                "resolution",
                normalizeSeedance2Resolution(
                  value,
                  showGrokVideoConfig
                    ? config.grokResolutionOptions[0]
                    : showHappyHorseConfig
                      ? config.happyHorseResolutionOptions[0]
                      : config.seedance2ResolutionOptions[0],
                ),
              )
            }
          >
            <SelectTrigger
              id={`${seedance2Id}-resolution`}
              className={cn("!h-9", CONTROL_CLASS)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {(showHappyHorseConfig
                ? config.happyHorseResolutionOptions
                : showGrokVideoConfig
                  ? config.grokResolutionOptions
                  : config.seedance2ResolutionOptions
              ).map((resolution) => (
                <SelectItem key={resolution} value={resolution}>
                  {resolution}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Seedance2Field>
        <Seedance2Field
          label={t("episode.workbench.video.ratio")}
          htmlFor={`${seedance2Id}-ratio`}
        >
          <Select
            value={draft.ratio}
            onValueChange={(value) =>
              config.updateDraft(
                "ratio",
                showGrokVideoConfig
                  ? normalizeGrokVideoRatio(value)
                  : showHappyHorseConfig
                    ? normalizeHappyHorseRatio(value)
                    : normalizeSeedance2Ratio(value),
              )
            }
          >
            <SelectTrigger
              id={`${seedance2Id}-ratio`}
              className={cn("!h-9", CONTROL_CLASS)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {(showHappyHorseConfig
                ? config.happyHorseRatioOptions
                : showGrokVideoConfig
                  ? config.grokRatioOptions
                  : (["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"] as const)
              ).map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Seedance2Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-muted-foreground">
        {showSeedance2Config && (
          <Seedance2Checkbox
            id={`${seedance2Id}-return-last-frame`}
            checked={draft.return_last_frame}
            label={t("episode.workbench.video.returnLastFrame")}
            onChange={(checked) =>
              config.updateDraft("return_last_frame", checked)
            }
          />
        )}
        {config.isValueStyle && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/80">
              {t("episode.workbench.video.seedance2GuidanceStyle")}
            </span>
            <div
              role="radiogroup"
              aria-label={t(
                "episode.workbench.video.seedance2GuidanceStyle",
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
                      `episode.workbench.video.seedance2SceneOptimizeLabels.${style}`,
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showSeedance2Config && draft.return_last_frame && (
        <div
          data-seedance2-returned-last-frame
          data-testid="seedance2-returned-last-frame-panel"
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
            data-testid="seedance2-returned-last-frame-box"
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
        data-testid="seedance2-prompt-panel"
        className="rounded-[10px] border border-border bg-card p-3"
      >
        <div className="grid gap-3">
          <Seedance2Field
            label={t("episode.workbench.video.seedance2PromptGuidance")}
            htmlFor={`${seedance2Id}-prompt-guidance`}
          >
            <MentionTextarea
              id={`${seedance2Id}-prompt-guidance`}
              aria-label={t(
                "episode.workbench.video.seedance2PromptGuidance",
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
          </Seedance2Field>
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
                htmlFor={`${seedance2Id}-prompt`}
                className="text-[11px] text-muted-foreground/78"
              >
                {showGrokVideoConfig
                  ? "Grok 提示词"
                  : showHappyHorseConfig
                    ? "主体提示词"
                    : t("episode.workbench.video.seedance2Prompt")}
              </Label>
            </div>
            <MentionTextarea
              id={`${seedance2Id}-prompt`}
              aria-label={t("episode.workbench.video.seedance2Prompt")}
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
              {showGrokVideoConfig
                ? "生成 Grok 提示词"
                : showHappyHorseConfig
                  ? "生成主体提示词"
                  : t("episode.workbench.video.seedance2GeneratePrompt")}
              <CreditCostInline display={config.promptCostDisplay} />
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
