// Copyright (c) 2026 AI anime
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
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

import { resolveMediaUrl } from "@/lib/media-url";
import { ratioToCss } from "@/lib/aspect-ratio";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { cn } from "@/lib/utils";
import { normalizeMentionSeparatorSpaces } from "@/lib/mention-markers";
import { CreditCostInline } from "@/components/credit-cost-inline";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MentionTextarea } from "@/components/episode/beat-workbench/mention-textarea";
import { Input } from "@/components/ui/input";
import {
  useUpdateBeat,
  type Beat,
} from "@/modules/narrative_planning/public";
import {
  buildSeedance2LabelIdentityMaps,
  BeatVideoGenerationAction,
  BeatVideoGenerationConfirmDialog,
  clampDuration,
  findSeedance2TrailingMention,
  getSeedance2MentionQuery,
  isSeedanceReferenceCropBackend,
  normalizeGrokVideoRatio,
  normalizeHappyHorseMode,
  normalizeHappyHorseRatio,
  normalizeSeedance2Mode,
  normalizeSeedance2Ratio,
  normalizeSeedance2Resolution,
  sameSeedance2LabelIdentity,
  remapSeedance2Mentions,
  LegacyVideoPromptView,
  Seedance2Checkbox,
  Seedance2Field,
  Seedance2AssetCropDialog,
  Seedance2AudioTrimDialog,
  Seedance2ReferenceAssetsView,
  Seedance2ReferenceCropAssetsView,
  Seedance2SummaryPill,
  seedance2CropAspectForMode,
  useBeatVideoGenerationController,
  useLegacyVideoPromptController,
  useSeedance2AssetOperationsController,
  useSeedance2BeatStatus,
  useSeedance2ConfigController,
  useVideoBackends,
  useVideoPaneMediaController,
  VideoPaneMediaView,
  VideoParamField,
  videoInputCropAspectForProjectAspect,
  type Seedance2LabelIdentityMaps,
} from "@/modules/production/public";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BeatStageState } from "@/types/beat-state";
import {
  MEDIA_PRIMARY_ACTION_BUTTON_CLASS,
  VIDEO_PROMPT_TEXTAREA_CLASS,
} from "./media-styles";

const SEEDANCE2_REFERENCE_DRAG_TYPE =
  "application/x-ai-anime-seedance2-reference";
const SEEDANCE2_PROMPT_GUIDANCE_TEMPLATES = [
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
const VIDEO_GRID_CLASS =
  "grid grid-cols-[auto_minmax(260px,1fr)] items-start gap-x-4 gap-y-3";
const SEEDANCE2_CONTROL_CLASS =
  "rounded-[8px] border-border bg-muted text-sm shadow-none focus-visible:border-primary/45 focus-visible:ring-primary/10";
const VIDEO_PARAM_CONTROL_CLASS =
  "!h-[30px] rounded-[7px] border border-border bg-muted px-2.5 text-[12px] font-normal leading-none text-foreground/86 shadow-none transition-colors hover:border-foreground/25 hover:bg-accent focus-visible:border-primary/45 focus-visible:ring-primary/10 [&>svg]:size-3.5";
const VIDEO_PARAM_ACTION_CLASS =
  "!h-[30px] gap-1.5 rounded-[7px] border border-border bg-muted px-2.5 text-[12px] font-normal leading-none text-foreground/86 shadow-none transition-[background-color,border-color,color,transform] hover:border-foreground/25 hover:bg-accent hover:text-foreground active:scale-95 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/45 [&_svg]:size-3.5";
const SEEDANCE2_PILL_ACTION_CLASS =
  "h-6 rounded-full border border-border bg-muted px-2 text-[11px] font-normal text-muted-foreground shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground";
const SEEDANCE2_SEGMENTED_OPTION_CLASS =
  "h-7 rounded-[7px] border px-1.5 text-xs font-normal shadow-none transition-[background-color,border-color,color] duration-150";
interface VideoPaneProps {
  beat: Beat;
  project: string;
  episode: number;
  state: BeatStageState;
  /** Episode-level video backend selected in the video panel. */
  defaultBackend: string;
  showAudioMediaStatus?: boolean;
}

type Seedance2ReferenceField = "prompt_guidance" | "final_prompt";

/**
 * 视频 sub-tab — first-frame preview + video preview + per-beat regen.
 * Per-beat backend override is deferred (see v3 spec P4 follow-up).
 */
export function VideoPane({
  beat,
  project,
  episode,
  state,
  defaultBackend,
  showAudioMediaStatus = true,
}: VideoPaneProps) {
  const { t } = useTranslation();
  const { spec } = useProjectAspectRatio(project);
  const frameAspectCss = ratioToCss(spec.renderAspect);
  const seedance2Id = useId();
  const updateBeat = useUpdateBeat(project, episode);
  const legacyPrompt = useLegacyVideoPromptController({
    beat,
    episode,
    project,
    updateBeat: (command) => updateBeat.mutateAsync(command),
  });
  const { data: videoBackendsRes } = useVideoBackends(project);
  const videoBackends = videoBackendsRes?.data ?? [];
  const assetOperations = useSeedance2AssetOperationsController({
    beatNumber: beat.beat_number,
    episode,
    project,
  });
  const [seedance2ReferencesOpen, setSeedance2ReferencesOpen] = useState(true);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [activeMentionField, setActiveMentionField] =
    useState<Seedance2ReferenceField>("final_prompt");
  // The mention query at which the dropdown was dismissed (Escape / after a
  // pick). Keeps it closed until the query changes again.
  const [mentionDismissedQuery, setMentionDismissedQuery] = useState<
    { field: Seedance2ReferenceField; query: string | null } | null
  >(null);
  const seedance2ReferenceSelectionRef = useRef<
    Record<Seedance2ReferenceField, { start: number; end: number } | null>
  >({
    prompt_guidance: null,
    final_prompt: null,
  });
  const selectedBackend = videoBackends.find((b) => b.value === defaultBackend);
  const showSeedance2Config = selectedBackend?.is_seedance2 === true;
  const showHappyHorseConfig = selectedBackend?.is_happyhorse === true;
  const showGrokVideoConfig = selectedBackend?.is_grok_video === true;
  const showPromptConfig =
    showSeedance2Config || showHappyHorseConfig || showGrokVideoConfig;
  const showReferenceDetails =
    showSeedance2Config ||
    showHappyHorseConfig ||
    showGrokVideoConfig ||
    isSeedanceReferenceCropBackend(defaultBackend);
  const seedance2Status = useSeedance2BeatStatus(
    project,
    episode,
    beat.beat_number,
    showReferenceDetails,
  );
  const seedance2StatusData =
    seedance2Status.data?.ok === true ? seedance2Status.data.data : null;
  const videoConfig = useSeedance2ConfigController({
    backend: defaultBackend,
    beat,
    episode,
    project,
    projectAspect: spec.renderAspect,
    selectedBackend,
    showGrokVideoConfig,
    showHappyHorseConfig,
    showSeedance2Config,
    refetchStatus: seedance2Status.refetch,
    updateBeat: updateBeat.mutateAsync,
  });
  const seedance2Draft = videoConfig.draft;
  const seedance2ResolutionOptions = videoConfig.seedance2ResolutionOptions;
  const seedance2DurationBounds = videoConfig.seedance2DurationBounds;
  const happyHorseResolutionOptions =
    videoConfig.happyHorseResolutionOptions;
  const happyHorseRatioOptions = videoConfig.happyHorseRatioOptions;
  const grokVideoResolutionOptions = videoConfig.grokResolutionOptions;
  const grokVideoRatioOptions = videoConfig.grokRatioOptions;
  const isSd15ProConfig = videoConfig.isSeedance15ProConfig;
  const showSeedance2ValueStyle = videoConfig.isValueStyle;
  const sd15DurationBounds = videoConfig.seedance15DurationBounds;
  const sd15Resolution = videoConfig.seedance15Resolution;
  const sd15Duration = videoConfig.seedance15Duration;
  const setSd15Resolution = videoConfig.setSeedance15Resolution;
  const setSd15Duration = videoConfig.setSeedance15Duration;
  const changeSeedance2Draft = videoConfig.changeDraft;
  const updateSeedance2Draft = videoConfig.updateDraft;
  const updateSeedance2Mode = videoConfig.updateMode;
  const seedance2Ready = videoConfig.ready;
  const seedance2PromptCostDisplay = videoConfig.promptCostDisplay;
  const seedance2AssetItems = seedance2StatusData?.assets.items ?? [];
  const modelReferenceAssetItems = useMemo(
    () =>
      showHappyHorseConfig || showGrokVideoConfig
        ? seedance2AssetItems.filter((asset) => asset.media_type === "image")
        : seedance2AssetItems,
    [seedance2AssetItems, showGrokVideoConfig, showHappyHorseConfig],
  );
  const referenceCropImageItems = useMemo(
    () => {
      const imageAssets = seedance2AssetItems.filter(
        (asset) =>
          asset.media_type === "image" &&
          asset.exists !== false &&
          Boolean(asset.url || asset.path),
      );
      if (showSeedance2Config || showHappyHorseConfig || showGrokVideoConfig) {
        return imageAssets;
      }
      return imageAssets.filter((asset) => asset.key === "first_frame");
    },
    [seedance2AssetItems, showGrokVideoConfig, showHappyHorseConfig, showSeedance2Config],
  );
  const seedance2ReferenceOptions = useMemo(
    () =>
      modelReferenceAssetItems.filter(
        (asset) =>
          asset.reference_label &&
          asset.reference_label !== "未发送" &&
          asset.exists !== false,
    ),
    [modelReferenceAssetItems],
  );
  const seedance2ReturnedLastFrameAsset = useMemo(
    () =>
      seedance2AssetItems.find((asset) => {
        if (asset.media_type !== "image" || !(asset.url || asset.path)) {
          return false;
        }
        return [
          "returned_last_frame",
          "return_last_frame",
          "last_frame_output",
        ].includes(asset.key);
      }) ?? null,
    [seedance2AssetItems],
  );
  const seedance2ReturnedLastFrameSrc =
    seedance2Draft.return_last_frame && seedance2ReturnedLastFrameAsset
      ? resolveMediaUrl(
          seedance2ReturnedLastFrameAsset.url ||
            seedance2ReturnedLastFrameAsset.path,
        )
      : null;
  const seedance2ReturnedLastFrameAspectCss = ratioToCss(
    seedance2Draft.ratio || spec.renderAspect,
  );
  const seedance2MentionQuery = getSeedance2MentionQuery(
    seedance2Draft[activeMentionField],
  );
  const seedance2MentionOptions = useMemo(() => {
    if (seedance2MentionQuery === null) return [];
    const query = seedance2MentionQuery.trim();
    return seedance2ReferenceOptions.filter((asset) => {
      const label = asset.reference_label;
      return !query || label.includes(query) || `@${label}`.includes(query);
    });
  }, [
    seedance2MentionQuery,
    seedance2ReferenceOptions,
  ]);
  const seedance2ReferenceLabels = useMemo(
    () => seedance2ReferenceOptions.map((asset) => asset.reference_label),
    [seedance2ReferenceOptions],
  );
  // 提示词 @图片N/@音频N 与参考素材的「label↔身份(URL)」映射，用于素材增删/重排后
  // 把提示词里的编号按素材身份重新对号（mention 始终跟着它引用的素材走）。
  const seedance2LabelIdentity = useMemo(
    () => buildSeedance2LabelIdentityMaps(seedance2ReferenceOptions),
    [seedance2ReferenceOptions],
  );
  // 提示词里 hover 到 @图片N 时弹出的小图预览：reference_label → 图片 URL（仅图片素材）。
  const seedance2MentionPreviews = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of seedance2ReferenceOptions) {
      if (asset.media_type !== "image") continue;
      const url = resolveMediaUrl(asset.url || asset.path);
      if (url) {
        map[asset.reference_label] = url;
      }
    }
    return map;
  }, [seedance2ReferenceOptions]);
  const seedance2MentionOpen =
    seedance2MentionOptions.length > 0 &&
    !(
      mentionDismissedQuery?.field === activeMentionField &&
      mentionDismissedQuery.query === seedance2MentionQuery
    );
  // Restart the highlight at the top whenever the query changes.
  useEffect(() => {
    setMentionActiveIndex(0);
  }, [activeMentionField, seedance2MentionQuery]);
  const seedance2PromptStatus = seedance2Ready
    ? t("episode.workbench.video.seedance2Ready")
    : t("episode.workbench.video.seedance2Missing");
  const generation = useBeatVideoGenerationController({
    applyNormalizedDraft: videoConfig.applyDraft,
    beatNumber: beat.beat_number,
    episode,
    generationInput: videoConfig.generationInput,
    project,
    prompt: showPromptConfig
      ? seedance2Draft.final_prompt
      : legacyPrompt.prompt,
    promptKind: showPromptConfig ? "seedance2" : "legacy",
    saveDraft: (draft) =>
      videoConfig.saveDraft(draft, { suppressSuccess: true }),
  });
  const mediaController = useVideoPaneMediaController({
    beatNumber: beat.beat_number,
    episode,
    project,
    state,
    videoActive: generation.started,
    videoBackends,
    videoProgress: generation.progress,
    videoUrl: beat.video_url,
    useSeedance2Preview: showSeedance2Config,
  });
  const hasGeneratedVideo = mediaController.hasGeneratedVideo;

  // 参考素材的「label↔身份(URL)」映射变化时（增删/重排导致后端重新编号），把提示词里
  // 的 @图片N/@音频N 按素材身份重新对号、被删的移除。后端拿到的仍是图片N，生成视频时
  // 编号已是最新位置。放在 beat 重置 effect 之后，读到的是重置后的草稿。
  // 前提：后端在素材增删时不自行重编号提示词（当前 bug「提示词不同步」即说明如此）。
  const prevSeedance2LabelIdentityRef = useRef<{
    beatNumber: number;
    maps: Seedance2LabelIdentityMaps;
  } | null>(null);
  useEffect(() => {
    if (!showPromptConfig) return;
    const prev = prevSeedance2LabelIdentityRef.current;
    prevSeedance2LabelIdentityRef.current = {
      beatNumber: beat.beat_number,
      maps: seedance2LabelIdentity,
    };
    // 切 beat / 首帧：只记录基线，不重映射（避免用上一个 beat 的映射改新 beat 的词）。
    if (!prev || prev.beatNumber !== beat.beat_number) return;
    if (sameSeedance2LabelIdentity(prev.maps, seedance2LabelIdentity)) return;
    changeSeedance2Draft((current) => {
      const finalPrompt = remapSeedance2Mentions(
        current.final_prompt,
        prev.maps,
        seedance2LabelIdentity,
      );
      const promptGuidance = remapSeedance2Mentions(
        current.prompt_guidance,
        prev.maps,
        seedance2LabelIdentity,
      );
      if (
        finalPrompt === current.final_prompt &&
        promptGuidance === current.prompt_guidance
      ) {
        return current;
      }
      return {
        ...current,
        final_prompt: finalPrompt,
        prompt_guidance: promptGuidance,
      };
    });
  }, [
    beat.beat_number,
    changeSeedance2Draft,
    seedance2LabelIdentity,
    showPromptConfig,
  ]);
  const insertSeedance2Reference = (
    field: Seedance2ReferenceField,
    label: string,
    options: {
      replaceTrailingMention?: boolean;
      selectionRange?: { start: number; end: number };
    } = {},
  ) => {
    // Mirror MentionTextarea.insertMention: every inserted reference is followed
    // by a single space so the next reference/word can't glue onto it.
    const token = `@${label} `;
    changeSeedance2Draft((current) => {
      const rawText = current[field];
      const text = rawText.trimEnd();
      if (options.selectionRange) {
        const start = Math.max(
          0,
          Math.min(options.selectionRange.start, rawText.length),
        );
        const end = Math.max(
          start,
          Math.min(options.selectionRange.end, rawText.length),
        );
        const after = rawText.slice(end).replace(/^\s+/, "");
        const nextText = normalizeMentionSeparatorSpaces(
          `${rawText.slice(0, start)}${token}${after}`,
          seedance2ReferenceLabels,
        ).text;
        return {
          ...current,
          [field]: nextText,
        };
      }
      const mention = options.replaceTrailingMention
        ? findSeedance2TrailingMention(text)
        : null;
      const finalPrompt = text.endsWith("@")
        ? `${text.slice(0, -1)}${token}`
        : mention
          ? `${text.slice(0, mention.index)}${token}`
        : text
          ? `${text}\n${token}`
          : token;
      const nextText = normalizeMentionSeparatorSpaces(
        finalPrompt,
        seedance2ReferenceLabels,
      ).text;
      return {
        ...current,
        [field]: nextText,
      };
    });
  };
  const rememberSeedance2PromptSelection = (
    field: Seedance2ReferenceField,
    target: HTMLTextAreaElement,
  ) => {
    setActiveMentionField(field);
    seedance2ReferenceSelectionRef.current[field] = {
      start: target.selectionStart,
      end: target.selectionEnd,
    };
  };
  const handleSeedance2ReferenceDragStart = (
    event: DragEvent<HTMLElement>,
    label: string,
  ) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(SEEDANCE2_REFERENCE_DRAG_TYPE, label);
    event.dataTransfer.setData("text/plain", `@${label}`);
  };
  const handleSeedance2ReferenceDragOver = (
    event: DragEvent<HTMLTextAreaElement>,
  ) => {
    const types = Array.from(event.dataTransfer.types);
    const mayBeReferenceDrop =
      seedance2ReferenceOptions.length > 0 &&
      (types.length === 0 ||
        types.includes(SEEDANCE2_REFERENCE_DRAG_TYPE) ||
        types.includes("text/plain") ||
        types.includes("text/uri-list") ||
        types.includes("text/html"));
    if (mayBeReferenceDrop) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };
  const handleSeedance2ReferenceDrop = (
    field: Seedance2ReferenceField,
    event: DragEvent<HTMLTextAreaElement>,
  ) => {
    const customLabel = event.dataTransfer.getData(
      SEEDANCE2_REFERENCE_DRAG_TYPE,
    );
    const plainLabel = event.dataTransfer.getData("text/plain").replace(/^@/, "");
    const label = (customLabel || plainLabel).trim();
    if (!seedance2ReferenceOptions.some((asset) => asset.reference_label === label)) {
      return;
    }
    event.preventDefault();
    setActiveMentionField(field);
    const selectionRange =
      document.activeElement === event.currentTarget
        ? {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          }
        : seedance2ReferenceSelectionRef.current[field] ?? undefined;
    insertSeedance2Reference(field, label, { selectionRange });
    setMentionDismissedQuery({ field, query: label });
  };
  const handleSelectMention = (field: Seedance2ReferenceField, label: string) => {
    setActiveMentionField(field);
    insertSeedance2Reference(field, label, { replaceTrailingMention: true });
    // After inserting, the prompt ends with `@<label>`, so that becomes the
    // trailing query — dismiss it so the dropdown doesn't immediately reopen.
    setMentionDismissedQuery({ field, query: label });
  };
  const handleMentionKeyDown = (
    field: Seedance2ReferenceField,
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    setActiveMentionField(field);
    if (!seedance2MentionOpen || event.nativeEvent.isComposing) return;
    const count = seedance2MentionOptions.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setMentionActiveIndex((index) => (index + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        setMentionActiveIndex((index) => (index - 1 + count) % count);
        break;
      case "Enter":
      case "Tab":
      case " ": {
        if (event.key === "Enter" && event.shiftKey) return;
        const option =
          seedance2MentionOptions[Math.min(mentionActiveIndex, count - 1)];
        if (option) {
          event.preventDefault();
          handleSelectMention(field, option.reference_label);
        }
        break;
      }
      case "Escape":
        event.preventDefault();
        setMentionDismissedQuery({ field, query: seedance2MentionQuery });
        break;
    }
  };
  const appendSeedance2PromptGuidanceTemplate = (template: string) => {
    changeSeedance2Draft((current) => {
      if (current.prompt_guidance.includes(template)) return current;
      const promptGuidance = [current.prompt_guidance.trim(), template]
        .filter(Boolean)
        .join("\n");
      return { ...current, prompt_guidance: promptGuidance };
    });
  };
  const renderSeedance2ReferenceControls = (field: Seedance2ReferenceField) => {
    if (activeMentionField !== field) return null;

    if (seedance2MentionOpen) {
      return (
        <div className="rounded-[8px] border border-border bg-muted p-1.5">
          <div className="mb-1 text-[10px] font-medium text-muted-foreground/78">
            {t("episode.workbench.video.seedance2MentionCandidates")}
          </div>
          <div className="flex flex-wrap gap-1">
            {seedance2MentionOptions.map((asset, index) => (
              <Button
                key={asset.key}
                type="button"
                size="xs"
                variant="ghost"
                aria-pressed={index === mentionActiveIndex}
                className={cn(
                  "h-6 rounded-[6px] border px-1.5 text-[10px] font-normal shadow-none",
                  index === mentionActiveIndex
                    ? "border-primary/35 bg-primary/[0.10] text-primary hover:bg-primary/[0.14] hover:text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:bg-accent hover:text-foreground",
                )}
                onMouseEnter={() => setMentionActiveIndex(index)}
                onClick={() => handleSelectMention(field, asset.reference_label)}
              >
                @{asset.reference_label}
              </Button>
            ))}
          </div>
        </div>
      );
    }

    if (seedance2ReferenceOptions.length <= 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground/78">
          {t("episode.workbench.video.seedance2AtReferences")}
        </span>
        {seedance2ReferenceOptions.map((asset) => (
          <Button
            key={asset.key}
            type="button"
            size="xs"
            variant="ghost"
            className={SEEDANCE2_PILL_ACTION_CLASS}
            onClick={() => insertSeedance2Reference(field, asset.reference_label)}
          >
            @{asset.reference_label}
          </Button>
        ))}
      </div>
    );
  };
  return (
    <div className={VIDEO_GRID_CLASS}>
      <VideoPaneMediaView
        controller={mediaController}
        frameAspectCss={frameAspectCss}
      />

      {!showPromptConfig && (
        <LegacyVideoPromptView
          className={showHappyHorseConfig ? "order-3" : undefined}
          controller={legacyPrompt}
        />
      )}

      {/* Full-width action row. Seedance2 keeps its generate action after config. */}
      {!showPromptConfig && (
        <div
          className={cn(
            "col-span-2 flex flex-wrap items-start gap-x-3 gap-y-2 pt-1",
            showHappyHorseConfig && "order-2",
          )}
        >
          {showHappyHorseConfig && (
            <>
              <VideoParamField
                label={t("episode.workbench.video.mode")}
                htmlFor={`happyhorse-${beat.beat_number}-mode`}
              >
                <Select
                  value={seedance2Draft.mode}
                  onValueChange={(v) =>
                    updateSeedance2Mode(normalizeHappyHorseMode(v))
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beat.beat_number}-mode`}
                    className={cn("w-28", VIDEO_PARAM_CONTROL_CLASS)}
                  >
                    <span
                      data-slot="select-value"
                      className="flex flex-1 items-center gap-1.5 text-left"
                    >
                      {t(
                        `episode.workbench.video.seedance2ModeLabels.${normalizeHappyHorseMode(
                          seedance2Draft.mode,
                        )}`,
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="first_frame">
                      {t("episode.workbench.video.seedance2ModeLabels.first_frame")}
                    </SelectItem>
                    <SelectItem value="multimodal_reference">
                      {t("episode.workbench.video.seedance2ModeLabels.multimodal_reference")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.duration")}
                htmlFor={`happyhorse-${beat.beat_number}-duration`}
              >
                <Input
                  id={`happyhorse-${beat.beat_number}-duration`}
                  aria-label={t("episode.workbench.video.duration")}
                  type="number"
                  min={seedance2DurationBounds.min}
                  max={seedance2DurationBounds.max}
                  value={seedance2Draft.duration}
                  onChange={(e) =>
                    updateSeedance2Draft(
                      "duration",
                      clampDuration(e.target.value, seedance2DurationBounds),
                    )
                  }
                  className={cn("w-20", VIDEO_PARAM_CONTROL_CLASS)}
                />
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.resolution")}
                htmlFor={`happyhorse-${beat.beat_number}-resolution`}
              >
                <Select
                  value={seedance2Draft.resolution}
                  onValueChange={(v) =>
                    updateSeedance2Draft(
                      "resolution",
                      normalizeSeedance2Resolution(v, happyHorseResolutionOptions[0]),
                    )
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beat.beat_number}-resolution`}
                    className={cn("w-24", VIDEO_PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {happyHorseResolutionOptions.map((resolution) => (
                      <SelectItem key={resolution} value={resolution}>
                        {resolution}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.ratio")}
                htmlFor={`happyhorse-${beat.beat_number}-ratio`}
              >
                <Select
                  value={seedance2Draft.ratio}
                  onValueChange={(v) =>
                    updateSeedance2Draft("ratio", normalizeHappyHorseRatio(v))
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beat.beat_number}-ratio`}
                    className={cn("w-24", VIDEO_PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {happyHorseRatioOptions.map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ratio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VideoParamField>
            </>
          )}
          {isSd15ProConfig && (
            <>
              <VideoParamField
                label={t("episode.workbench.video.duration")}
                htmlFor={`sd15-${beat.beat_number}-duration`}
              >
                <Input
                  id={`sd15-${beat.beat_number}-duration`}
                  aria-label={t("episode.workbench.video.duration")}
                  type="number"
                  min={sd15DurationBounds.min}
                  max={sd15DurationBounds.max}
                  value={sd15Duration}
                  onChange={(e) =>
                    setSd15Duration(
                      clampDuration(e.target.value, sd15DurationBounds),
                    )
                  }
                  className={cn("w-20", VIDEO_PARAM_CONTROL_CLASS)}
                />
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.resolution")}
                htmlFor={`sd15-${beat.beat_number}-resolution`}
              >
                <Select
                  value={sd15Resolution}
                  onValueChange={(v) =>
                    setSd15Resolution(
                      normalizeSeedance2Resolution(
                        v,
                        seedance2ResolutionOptions[0],
                      ),
                    )
                  }
                >
                  <SelectTrigger
                    id={`sd15-${beat.beat_number}-resolution`}
                    className={cn("w-24", VIDEO_PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {seedance2ResolutionOptions.map((resolution) => (
                      <SelectItem key={resolution} value={resolution}>
                        {resolution}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VideoParamField>
            </>
          )}
          <VideoParamField label="" hiddenLabel>
            <BeatVideoGenerationAction
              className={VIDEO_PARAM_ACTION_CLASS}
              controller={generation}
              hasGeneratedVideo={hasGeneratedVideo}
            />
          </VideoParamField>
        </div>
      )}

      {!showPromptConfig && showReferenceDetails && (
        <Seedance2ReferenceCropAssetsView
          aspectRatio={ratioToCss(spec.sketchAspect)}
          assets={referenceCropImageItems}
          className={showHappyHorseConfig ? "order-1" : undefined}
          controller={assetOperations}
          open={seedance2ReferencesOpen}
          onOpenChange={setSeedance2ReferencesOpen}
        />
      )}

      {showPromptConfig && (
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
              active={seedance2StatusData?.media.render_ready ?? !!beat.frame_url}
              label={t("episode.workbench.video.renderReady")}
            />
            {showAudioMediaStatus && (
              <Seedance2SummaryPill
                active={seedance2StatusData?.media.audio_ready ?? !!beat.audio_url}
                label={t("episode.workbench.video.audioReady")}
              />
            )}
            <Seedance2SummaryPill
              active={seedance2Ready}
              label={seedance2PromptStatus}
            />
            {showSeedance2Config && (
              <Seedance2SummaryPill
                active={seedance2StatusData?.voice.ready ?? false}
                label={
                  seedance2StatusData?.voice.label ??
                  t("episode.workbench.video.narratorVoiceMissing")
                }
              />
            )}
            <span className="inline-flex h-5 max-w-full items-center rounded-full border border-border bg-muted px-2 text-[11px] leading-none text-muted-foreground">
              {t("episode.workbench.video.seedance2ReferenceStats", {
                selected: seedance2StatusData?.assets.selected ?? 0,
                missing: seedance2StatusData?.assets.missing ?? 0,
              })}
            </span>
            <span className="inline-flex h-5 max-w-full items-center rounded-full border border-border bg-muted px-2 text-[11px] leading-none text-muted-foreground">
              {t("episode.workbench.video.videoVersions", {
                count: mediaController.candidateCount,
              })}
            </span>
          </div>

          <Seedance2ReferenceAssetsView
            assets={modelReferenceAssetItems}
            controller={assetOperations}
            imageOnly={showHappyHorseConfig || showGrokVideoConfig}
            missingCount={seedance2StatusData?.assets.missing ?? 0}
            mode={seedance2Draft.mode}
            open={seedance2ReferencesOpen}
            selectedCount={seedance2StatusData?.assets.selected ?? 0}
            onOpenChange={setSeedance2ReferencesOpen}
            onReferenceDragStart={handleSeedance2ReferenceDragStart}
          />

          <div className="grid gap-3 rounded-[10px] border border-border bg-card p-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
            <Seedance2Field
              label={t("episode.workbench.video.mode")}
              htmlFor={`${seedance2Id}-mode`}
            >
              <Select
                value={seedance2Draft.mode}
                onValueChange={(v) =>
                  updateSeedance2Mode(
                    showHappyHorseConfig || showGrokVideoConfig
                      ? normalizeHappyHorseMode(v)
                      : normalizeSeedance2Mode(v),
                  )
                }
              >
                <SelectTrigger
                  id={`${seedance2Id}-mode`}
                  className={cn("!h-9", SEEDANCE2_CONTROL_CLASS)}
                >
                  <span
                    data-slot="select-value"
                    className="flex flex-1 items-center gap-1.5 text-left"
                  >
                    {t(
                      `episode.workbench.video.seedance2ModeLabels.${
                        showHappyHorseConfig
                          ? normalizeHappyHorseMode(seedance2Draft.mode)
                          : showGrokVideoConfig
                          ? normalizeHappyHorseMode(seedance2Draft.mode)
                          : seedance2Draft.mode
                      }`,
                    )}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="first_frame">
                    {t("episode.workbench.video.seedance2ModeLabels.first_frame")}
                  </SelectItem>
                  {!showHappyHorseConfig && !showGrokVideoConfig && (
                    <SelectItem value="first_last_frame">
                      {t("episode.workbench.video.seedance2ModeLabels.first_last_frame")}
                    </SelectItem>
                  )}
                  <SelectItem value="multimodal_reference">
                    {t("episode.workbench.video.seedance2ModeLabels.multimodal_reference")}
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
                min={seedance2DurationBounds.min}
                max={seedance2DurationBounds.max}
                value={seedance2Draft.duration}
                onChange={(e) =>
                  updateSeedance2Draft(
                    "duration",
                    clampDuration(e.target.value, seedance2DurationBounds),
                  )
                }
                className={cn("!h-9", SEEDANCE2_CONTROL_CLASS)}
              />
            </Seedance2Field>
            <Seedance2Field
              label={t("episode.workbench.video.resolution")}
              htmlFor={`${seedance2Id}-resolution`}
            >
              <Select
                value={seedance2Draft.resolution}
                onValueChange={(v) =>
                  updateSeedance2Draft(
                    "resolution",
                    normalizeSeedance2Resolution(
                      v,
                      showGrokVideoConfig
                        ? grokVideoResolutionOptions[0]
                        : showHappyHorseConfig
                        ? happyHorseResolutionOptions[0]
                        : seedance2ResolutionOptions[0],
                    ),
                  )
                }
              >
                <SelectTrigger
                  id={`${seedance2Id}-resolution`}
                  className={cn("!h-9", SEEDANCE2_CONTROL_CLASS)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {(showHappyHorseConfig
                    ? happyHorseResolutionOptions
                    : showGrokVideoConfig
                    ? grokVideoResolutionOptions
                    : seedance2ResolutionOptions
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
                value={seedance2Draft.ratio}
                onValueChange={(v) =>
                  updateSeedance2Draft(
                    "ratio",
                    showGrokVideoConfig
                      ? normalizeGrokVideoRatio(v)
                      : showHappyHorseConfig
                      ? normalizeHappyHorseRatio(v)
                      : normalizeSeedance2Ratio(v),
                  )
                }
              >
                <SelectTrigger
                  id={`${seedance2Id}-ratio`}
                  className={cn("!h-9", SEEDANCE2_CONTROL_CLASS)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {(showHappyHorseConfig
                    ? happyHorseRatioOptions
                    : showGrokVideoConfig
                    ? grokVideoRatioOptions
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
                checked={seedance2Draft.return_last_frame}
                label={t("episode.workbench.video.returnLastFrame")}
                onChange={(checked) => updateSeedance2Draft("return_last_frame", checked)}
              />
            )}
            {showSeedance2ValueStyle && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground/80">
                  {t("episode.workbench.video.seedance2GuidanceStyle")}
                </span>
                <div
                  role="radiogroup"
                  aria-label={t("episode.workbench.video.seedance2GuidanceStyle")}
                  className="inline-flex items-center gap-1"
                >
                  {(["anime", "realistic"] as const).map((style) => {
                    const active = seedance2Draft.scene_optimize === style;
                    return (
                      <button
                        key={style}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={cn(
                          SEEDANCE2_SEGMENTED_OPTION_CLASS,
                          active
                            ? "border-primary/45 bg-primary/10 text-primary"
                            : "border-border bg-muted text-muted-foreground hover:border-foreground/25 hover:bg-accent hover:text-foreground",
                        )}
                        onClick={() =>
                          updateSeedance2Draft("scene_optimize", style)
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
          {showSeedance2Config && seedance2Draft.return_last_frame && (
            <div
              data-seedance2-returned-last-frame
              data-testid="seedance2-returned-last-frame-panel"
              className="inline-flex w-fit max-w-full flex-col rounded-[8px] border border-border bg-card p-1.5"
            >
              <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <ImageIcon className="size-3" />
                <span>{t("episode.workbench.video.returnLastFrame")}</span>
                {seedance2ReturnedLastFrameSrc && seedance2ReturnedLastFrameAsset && (
                  <a
                    href={seedance2ReturnedLastFrameSrc}
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
                  seedance2ReturnedLastFrameSrc && seedance2ReturnedLastFrameAsset
                    ? "border border-border"
                    : "border border-dashed border-border",
                )}
                style={{ aspectRatio: seedance2ReturnedLastFrameAspectCss }}
              >
                {seedance2ReturnedLastFrameSrc && seedance2ReturnedLastFrameAsset ? (
                  <img
                    src={seedance2ReturnedLastFrameSrc}
                    alt={seedance2ReturnedLastFrameAsset.label}
                    className="absolute inset-0 h-full w-full object-contain"
                    decoding="async"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-[10px] text-muted-foreground/72">
                    <ImageIcon className="size-5 opacity-60" />
                    <span>{t("episode.workbench.video.returnLastFramePending")}</span>
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
                  aria-label={t("episode.workbench.video.seedance2PromptGuidance")}
                  value={seedance2Draft.prompt_guidance}
                  onChange={(e) => {
                    updateSeedance2Draft("prompt_guidance", e.target.value);
                    rememberSeedance2PromptSelection(
                      "prompt_guidance",
                      e.currentTarget,
                    );
                  }}
                  onFocus={(e) =>
                    rememberSeedance2PromptSelection(
                      "prompt_guidance",
                      e.currentTarget,
                    )
                  }
                  onKeyDown={(e) => handleMentionKeyDown("prompt_guidance", e)}
                  onKeyUp={(e) =>
                    rememberSeedance2PromptSelection(
                      "prompt_guidance",
                      e.currentTarget,
                    )
                  }
                  onMouseUp={(e) =>
                    rememberSeedance2PromptSelection(
                      "prompt_guidance",
                      e.currentTarget,
                    )
                  }
                  onSelect={(e) =>
                    rememberSeedance2PromptSelection(
                      "prompt_guidance",
                      e.currentTarget,
                    )
                  }
                  onDragOver={handleSeedance2ReferenceDragOver}
                  onDrop={(e) => handleSeedance2ReferenceDrop("prompt_guidance", e)}
                  mentionLabels={seedance2ReferenceLabels}
                  mentionPreviews={seedance2MentionPreviews}
                  rows={2}
                  className={cn("min-h-[72px]", VIDEO_PROMPT_TEXTAREA_CLASS)}
                />
              </Seedance2Field>
              {renderSeedance2ReferenceControls("prompt_guidance")}
              <div className="flex flex-wrap gap-1.5">
                {SEEDANCE2_PROMPT_GUIDANCE_TEMPLATES.map((template) => (
                  <Button
                    key={template.key}
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={updateBeat.isPending}
                    className={SEEDANCE2_PILL_ACTION_CLASS}
                    onClick={() =>
                      appendSeedance2PromptGuidanceTemplate(template.text)
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
                  value={seedance2Draft.final_prompt}
                  onChange={(e) => {
                    updateSeedance2Draft("final_prompt", e.target.value);
                    rememberSeedance2PromptSelection(
                      "final_prompt",
                      e.currentTarget,
                    );
                  }}
                  onFocus={(e) =>
                    rememberSeedance2PromptSelection(
                      "final_prompt",
                      e.currentTarget,
                    )
                  }
                  onKeyDown={(e) => handleMentionKeyDown("final_prompt", e)}
                  onKeyUp={(e) =>
                    rememberSeedance2PromptSelection(
                      "final_prompt",
                      e.currentTarget,
                    )
                  }
                  onMouseUp={(e) =>
                    rememberSeedance2PromptSelection(
                      "final_prompt",
                      e.currentTarget,
                    )
                  }
                  onSelect={(e) =>
                    rememberSeedance2PromptSelection(
                      "final_prompt",
                      e.currentTarget,
                    )
                  }
                  onDragOver={handleSeedance2ReferenceDragOver}
                  onDrop={(e) => handleSeedance2ReferenceDrop("final_prompt", e)}
                  mentionLabels={seedance2ReferenceLabels}
                  mentionPreviews={seedance2MentionPreviews}
                  rows={2}
                  className={cn("min-h-[72px]", VIDEO_PROMPT_TEXTAREA_CLASS)}
                />
                {renderSeedance2ReferenceControls("final_prompt")}
              </div>
              <div className="flex flex-wrap justify-start gap-2 pt-1">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={videoConfig.promptPending}
                  onClick={() => void videoConfig.generatePrompt()}
                  className={MEDIA_PRIMARY_ACTION_BUTTON_CLASS}
                >
                  {videoConfig.promptPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <WandSparkles className="size-3" />
                  )}
                  {showGrokVideoConfig
                    ? "生成 Grok 提示词"
                    : showHappyHorseConfig
                    ? "生成主体提示词"
                    : t("episode.workbench.video.seedance2GeneratePrompt")}
                  <CreditCostInline display={seedance2PromptCostDisplay} />
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
      )}

      <Seedance2AssetCropDialog
        intent={assetOperations.cropIntent}
        targetCropAspect={
          showSeedance2Config
            ? seedance2CropAspectForMode(
                seedance2Draft.mode,
                seedance2Draft.ratio,
                spec.renderAspect,
              )
            : videoInputCropAspectForProjectAspect(spec.renderAspect)
        }
        pending={assetOperations.cropPending}
        onOpenChange={(open) => {
          if (!open) assetOperations.closeCrop();
        }}
        onSave={assetOperations.saveCrop}
      />
      <Seedance2AudioTrimDialog
        asset={assetOperations.trimAsset}
        start={assetOperations.trimStart}
        duration={assetOperations.trimDuration}
        pending={assetOperations.trimPending}
        onStartChange={assetOperations.setTrimStart}
        onDurationChange={assetOperations.setTrimDuration}
        onOpenChange={(open) => {
          if (!open) assetOperations.closeTrim();
        }}
        onSave={assetOperations.saveTrim}
      />

      <BeatVideoGenerationConfirmDialog
        controller={generation}
        hasGeneratedVideo={hasGeneratedVideo}
      />
    </div>
  );
}
