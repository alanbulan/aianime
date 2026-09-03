// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { toast } from "sonner";

import { useAspectRatioStore } from "@/shared/stores/aspect-ratio-store";
import type { Beat } from "@/modules/narrative_planning/public";
import { VideoPane } from "@/modules/production/video-pane-composition";
import type { VideoReferenceAssetItem } from "@/modules/production/public";

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
    resources: {
      zh: {
        translation: {
          common: {
            confirm: "确认",
            cancel: "取消",
            download: "下载",
            regenerate: "重新生成",
            save: "保存",
          },
          episode: {
            workbench: {
              video: {
                started: "Beat #{{n}} 视频已启动",
                regenFailed: "重生失败",
                model: "模型",
                generating: "生成中...",
                genFailed: "生成失败",
                notGenerated: "尚未生成",
                genTitle: "生成视频？",
                genDesc: "已仔细检查参考图与提示词，将为 Beat #{{n}} 生成视频片段。",
                regenTitle: "重新生成视频？",
                regenDesc: "将为 Beat #{{n}} 重新生成视频片段。",
                noteDefault: "默认",
                noteDialogue: "对白镜头",
                switched: "Beat #{{n}} 已切换版本",
                switchFailed: "切换失败",
                videoReferencePrompt: "VideoReference.0主体提示词",
                videoReferenceReady: "已配置",
                videoPromptReady: "模型提示词已配置",
                videoPromptMissing: "模型提示词未配置",
                videoReferenceSaved: "VideoReference 配置已保存",
                videoReferenceInspector: "VideoReference Inspector",
                videoReferencePreviewMode: "VideoReference 预览模式",
                mediaStatus: "媒体状态",
                promptStatus: "Prompt 状态",
                videoVersions: "视频版本（{{count}}）",
                renderReady: "Render",
                audioReady: "音频",
                videoReady: "视频",
                videoReferences: "参考素材",
                videoReferenceVoice: "声线",
                videoReferenceStatSent: "{{count}} 已选择",
                videoReferenceStatInvalid: "{{count}} 不合规",
                videoReferenceStatMissing: "{{count}} 文件缺失",
                videoReferenceStatUnused: "{{count}} 未引用",
                videoReferenceStatFallback: "{{count}} 文本替代",
                videoReferenceTextOverlay: "画面文字",
                videoReferenceAtReferences: "@ 引用",
                videoReferenceMentionCandidates: "引用候选",
                videoReferenceDetails: "参考素材详情",
                videoReferenceSent: "已选择",
                videoReferenceInvalid: "不合规",
                videoReferenceMissing: "缺失",
                videoReferenceFallback: "缺参考图",
                videoReferenceUnused: "未引用",
                videoReferenceProblemTitle: "以下素材不可用于本次请求，请先处理：",
                videoReferenceProblemItem: "{{label}}：{{detail}}",
                videoReferenceImage: "参考图",
                videoReferenceEmpty: "暂无参考素材",
                videoReferenceAssetUpload: "上传素材",
                videoReferenceAssetUploaded: "VideoReference 参考素材已上传",
                videoReferenceAssetDelete: "删除",
                videoReferenceAssetDeleted: "VideoReference 参考素材已删除",
                videoReferenceAssetCrop: "裁剪",
                videoReferenceAssetCropped: "VideoReference 参考图已裁剪",
                videoReferenceAssetCropTitle: "裁剪 VideoReference 参考图",
                videoReferenceAssetAudioTrim: "裁剪音频",
                videoReferenceAssetAudioTrimTitle: "裁剪 VideoReference 参考音频",
                videoReferenceAssetAudioTrimHint: "保留 3-5 秒清晰单人声。",
                videoReferenceAssetAudioTrimStart: "起点",
                videoReferenceAssetAudioTrimDuration: "时长",
                videoReferenceAssetAudioTrimApply: "裁剪到 3-5 秒",
                videoReferenceAssetAudioTrimInvalid: "裁剪参数无效",
                videoReferenceAssetAudioTrimmed: "VideoReference 参考音频已裁剪",
                videoReferenceCropWidth: "宽",
                videoReferenceCropHeight: "高",
                videoReferenceModeLabels: {
                  first_frame: "首帧模式",
                  first_last_frame: "首尾帧模式",
                  multimodal_reference: "多参模式",
                },
                mode: "生成模式",
                duration: "时长",
                resolution: "分辨率",
                ratio: "画幅",
                generateAudio: "生成声音",
                returnLastFrame: "返回尾帧",
                returnLastFramePending: "等待生成尾帧",
                humanReview: "真人审核",
                generateVideo: "生成视频",
                preview: {
                  render: "Render",
                  sketch: "草图",
                  audio: "音频",
                  video: "视频",
                },
                previewMissing: {
                  render: "暂无 Render 首帧",
                  sketch: "暂无草图",
                  audio: "暂无音频",
                  video: "暂无视频",
                },
                videoReferencePromptGuidance: "自定义提示词",
                videoReferenceGuidanceSubject: "主体",
                videoReferenceGuidanceScene: "场景",
                videoReferenceGuidanceLighting: "光影",
                videoReferenceGuidanceCamera: "镜头",
                videoReferenceGuidanceStyle: "风格",
                videoReferenceSceneOptimizeLabels: {
                  anime: "动漫",
                  realistic: "写实",
                },
                videoReferenceGeneratePrompt: "AI 优化",
                videoReferencePromptGenerated: "VideoReference Prompt 已优化",
                videoReferencePromptGeneratedOtherBeat: "主体提示词已优化，已写回镜头 #{{n}}",
                videoReferencePromptGenerateFailed: "VideoReference Prompt 生成失败",
                videoPrompt: "视频提示词",
                keyframePrompt: "单个 Beat 视频提示词",
                generateBeatVideoPrompt: "生成本 Beat 提示词",
                beatVideoPromptGenerated: "本 Beat 视频提示词已生成",
                beatVideoPromptGenerateStarted: "本 Beat 视频提示词生成已启动",
                beatVideoPromptGenerateFailed: "本 Beat 视频提示词生成失败",
                beatVideoPromptRequired:
                  "Beat #{{n}} 缺少视频提示词，请先点击“生成本 Beat 提示词”。",
                videoReferencePromptRequired:
                  "Beat #{{n}} 缺少 VideoReference.0主体提示词，请先填写或点击“AI 优化”。",
                videoReferenceOverlayEnabled: "启用",
                videoReferenceOverlayKind: "类型",
                videoReferenceOverlayKindAdCopy: "广告语",
                videoReferenceOverlayKindSubtitle: "字幕",
                videoReferenceOverlayKindSpeechBubble: "气泡台词",
                videoReferenceOverlayPlacement: "位置",
                videoReferenceOverlayTiming: "出现时机",
                videoReferenceOverlayStyle: "文字样式",
                videoReferenceOverlayContent: "文字内容",
                videoReferenceOverlaySpeaker: "气泡说话者",
                videoReferenceOverlaySpeakerNone: "不指定",
                narratorVoice: "解说声线",
                narratorVoiceReady: "解说声线",
                narratorVoiceMissing: "声线缺失",
                narratorVoiceUpload: "上传",
                narratorVoiceRecord: "录音",
                narratorVoiceDelete: "删除",
              },
            },
          },
        },
      },
    },
  });
});

const updateBeatMock: Mock = vi.fn();
const regenerateMock: Mock = vi.fn();
const poolSelectMock: Mock = vi.fn();
const taskStartMock: Mock = vi.fn();
const deleteNarratorVoiceMock: Mock = vi.fn();
const generateVideoPromptMock: Mock = vi.fn();
const generateBeatVideoPromptMock: Mock = vi.fn();
const cropVideoReferenceAssetMock: Mock = vi.fn();
const trimVideoReferenceAssetMock: Mock = vi.fn();
const videoQueryMockState = vi.hoisted(() => ({
  hideReturnedLastFrame: false,
  includeAudioAsset: false,
  invalidVoiceAsset: false,
  videoReferenceAssetsOverride: null as VideoReferenceAssetItem[] | null,
}));

const videoQueryMocks = vi.hoisted(() => ({
  useRegenerateBeatVideo: () => ({
    mutateAsync: regenerateMock,
    isPending: false,
  }),
  useUploadVideoReferenceAsset: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteVideoReferenceAsset: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useCropVideoReferenceAsset: () => ({
    mutateAsync: cropVideoReferenceAssetMock,
    isPending: false,
  }),
  useTrimVideoReferenceAsset: () => ({
    mutateAsync: trimVideoReferenceAssetMock,
    isPending: false,
  }),
  useNarratorVoiceStatus: () => ({
    data: {
      ok: true,
      data: {
        narration_style: "third_person",
        source: "project_narrator",
        reference_path: "assets/narrator/voice.wav",
        reference_url: "/static/demo/assets/narrator/voice.wav",
        reference_sha256: "sha-voice",
        heading: "第三人称项目解说声线",
        detail: "assets/narrator/voice.wav",
        explanation: "第三人称解说使用项目级声线；所有非对白 Beat 使用同一声线。",
        is_first_person: false,
      },
    },
    isLoading: false,
    isError: false,
  }),
  useUploadNarratorVoice: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRecordNarratorVoice: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useBindNarratorVoice: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useTrimNarratorVoice: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteNarratorVoice: () => ({
    mutateAsync: deleteNarratorVoiceMock,
    isPending: false,
  }),
  useGenerateVideoPrompt: () => ({
    mutateAsync: generateVideoPromptMock,
    isPending: false,
  }),
  useGenerateBeatVideoPrompt: () => ({
    mutateAsync: generateBeatVideoPromptMock,
    isPending: false,
  }),
  useVideoReferenceBeatStatus: () => ({
    data: {
      ok: true as const,
      data: {
        beat_number: 1,
        audio_type: "dialogue",
        video_config_json: "",
        media: {
          render_ready: true,
          audio_ready: true,
          video_ready: true,
        },
        voice: {
          required: true,
          ready: !videoQueryMockState.invalidVoiceAsset,
          label: videoQueryMockState.invalidVoiceAsset
            ? "声线不合规"
            : "声线就绪",
          detail: videoQueryMockState.invalidVoiceAsset
            ? "白石夏音 · 学生时期声线：参考声线只有 1.04 秒，VideoReference 要求至少 1.8 秒。"
            : "陆辰_青年时期",
          speaker: "陆辰_青年时期",
        },
        prompt: {
          ready: true,
          source: "generated",
          status: "AI 生成",
          has_guidance: true,
          text_overlay_enabled: true,
          text_overlay: {
            enabled: true,
            kind: "caption",
            content: "鹿镇北口",
            placement: "center",
            timing: "auto",
            style: "white text",
          },
          inputs_stale: false,
        },
        assets: {
          total: videoQueryMockState.invalidVoiceAsset ? 1 : 6,
          selected: videoQueryMockState.invalidVoiceAsset ? 0 : 4,
          missing: 0,
          invalid: videoQueryMockState.invalidVoiceAsset ? 1 : 0,
          unused: videoQueryMockState.invalidVoiceAsset ? 0 : 1,
          images: 3,
          audios: 1,
          fallbacks: videoQueryMockState.invalidVoiceAsset ? 0 : 1,
          items: (
            videoQueryMockState.videoReferenceAssetsOverride ?? [
            {
              key: "first_frame",
              label: "当前 render · Beat 1",
              media_type: "image",
              selected: true,
              exists: true,
              reference_label: "图片1",
              note: "多参考模式下作为参考图发送",
              path: "frames/ep001/beat_01.png",
              url: "/static/demo/frames/ep001/beat_01.png",
              crop_source_path: "frames/ep001/beat_01.png",
              can_crop: true,
              can_delete: false,
            },
            {
              key: "manual:image:2",
              label: "手动素材 2",
              media_type: "image",
              selected: true,
              exists: true,
              reference_label: "图片2",
              note: "手动参考图",
              path: "videoReference/manual_02.png",
              url: "/static/demo/video-reference/manual_02.png",
              can_crop: true,
              can_delete: true,
            },
            {
              key: "manual:image:3",
              label: "手动素材 3",
              media_type: "image",
              selected: true,
              exists: true,
              reference_label: "图片3",
              note: "手动参考图",
              path: "videoReference/manual_03.png",
              url: "/static/demo/video-reference/manual_03.png",
              can_crop: true,
              can_delete: true,
            },
            {
              key: "manual:image:4",
              label: "手动素材 4",
              media_type: "image",
              selected: true,
              exists: true,
              reference_label: "图片4",
              note: "手动参考图",
              path: "videoReference/manual_04.png",
              url: "/static/demo/video-reference/manual_04.png",
              can_crop: true,
              can_delete: true,
            },
            {
              key: "manual:image:5",
              label: "手动素材 5",
              media_type: "image",
              selected: true,
              exists: true,
              reference_label: "图片5",
              note: "手动参考图",
              path: "videoReference/manual_05.png",
              url: "/static/demo/video-reference/manual_05.png",
              can_crop: true,
              can_delete: true,
            },
            {
              key: "manual:image:6",
              label: "手动素材 6",
              media_type: "image",
              selected: true,
              exists: true,
              reference_label: "图片6",
              note: "手动参考图",
              path: "videoReference/manual_06.png",
              url: "/static/demo/video-reference/manual_06.png",
              can_crop: true,
              can_delete: true,
            },
            {
              key: "manual:image:7",
              label: "手动素材 7",
              media_type: "image",
              selected: true,
              exists: true,
              reference_label: "图片7",
              note: "手动参考图",
              path: "videoReference/manual_07.png",
              url: "/static/demo/video-reference/manual_07.png",
              can_crop: true,
              can_delete: true,
            },
            {
              key: "returned_last_frame",
              label: "返回尾帧 · Beat 1",
              media_type: "image",
              selected: false,
              exists: true,
              reference_label: "尾帧",
              note: "VideoReference 返回尾帧",
              path: "videoReference/beat_01_last_frame.png",
              url: "/static/demo/video-reference/beat_01_last_frame.png",
              can_crop: false,
              can_delete: false,
            },
            ...(videoQueryMockState.includeAudioAsset
              ? [
                  {
                    key: "voice:narrator",
                    label: "项目解说声线",
                    media_type: "audio",
                    selected: true,
                    exists: true,
                    reference_label: "音频1",
                    note: "VideoReference 解说参考声线",
                    path: "assets/narrator/voice.mp3",
                    url: "/static/demo/assets/narrator/voice.mp3",
                    abs_path: "/project/assets/narrator/voice.mp3",
                    can_crop: false,
                    can_trim: true,
                    can_delete: false,
                  },
                ]
              : []),
            {
              key: "identity:陆辰_青年时期",
              label: "陆辰 · 青年时期",
              media_type: "image",
              selected: false,
              exists: false,
              required: false,
              state: "fallback" as const,
              reference_label: "未发送",
              note: "有图时作为角色身份图保持一致",
              fallback_text: "使用角色文本身份描述",
            },
          ]).filter(
            (asset) =>
              !videoQueryMockState.hideReturnedLastFrame ||
              asset.key !== "returned_last_frame",
          ),
        },
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/modules/production/composition", async () => {
  const { createUseBeatVideoGenerationController } = await import(
    "@/modules/production/application/use-beat-video-generation-controller"
  );
  const { createUseBasicVideoPromptController } = await import(
    "@/modules/production/application/use-basic-video-prompt-controller"
  );
  const { createUseVideoReferenceAssetOperationsController } = await import(
    "@/modules/production/application/use-video-reference-asset-operations-controller"
  );
  const { createUseBeatVideoConfigController } = await import(
    "@/modules/production/application/use-beat-video-config-controller"
  );
  const { createUseVideoPaneController } = await import(
    "@/modules/production/application/use-video-pane-controller"
  );
  const { useVideoReferenceMentionController } = await import(
    "@/modules/production/application/use-video-reference-mention-controller"
  );
  const { useProjectAspectRatio } = await import(
    "@/shared/stores/aspect-ratio-store"
  );
  const useBasicVideoPromptController =
    createUseBasicVideoPromptController(
      {
        useGenerateBeatVideoPrompt:
          videoQueryMocks.useGenerateBeatVideoPrompt,
      },
    );
  const useBeatVideoGenerationController =
    createUseBeatVideoGenerationController(
      {
        useRegenerateBeatVideo: videoQueryMocks.useRegenerateBeatVideo,
      },
    );
  const useVideoReferenceAssetOperationsController =
    createUseVideoReferenceAssetOperationsController({
      useUploadVideoReferenceAsset: videoQueryMocks.useUploadVideoReferenceAsset,
      useDeleteVideoReferenceAsset: videoQueryMocks.useDeleteVideoReferenceAsset,
      useCropVideoReferenceAsset: videoQueryMocks.useCropVideoReferenceAsset,
      useTrimVideoReferenceAsset: videoQueryMocks.useTrimVideoReferenceAsset,
    });
  const useBeatVideoConfigController = createUseBeatVideoConfigController(
    {
      useGenerateVideoPrompt:
        videoQueryMocks.useGenerateVideoPrompt,
    },
  );
  const useVideoPaneMediaController = (options: {
    beatNumber: number;
    state: "missing" | "generating" | "ready" | "failed";
    videoActive: boolean;
    videoProgress: number;
    videoUrl?: string | null;
    useVideoReferencePreview: boolean;
  }) => {
    const downloadUrl = options.videoUrl || null;
    const candidates =
      options.beatNumber === 1
        ? [
            {
              active: true,
              modelLabel: "VideoReference.0 Fast",
              modelTooltip: "VideoReference.0 Fast",
              id: "vid-2",
              previewSource: "/static/new.mp4#t=0.1",
              timeLabel: "1h",
              timeTooltip: "Generated 1h ago",
            },
            {
              active: false,
              modelLabel: "VideoReference.0 Fast",
              modelTooltip: "VideoReference.0 Fast",
              id: "vid-1",
              previewSource: "/static/old.mp4#t=0.1",
              timeLabel: "2h",
              timeTooltip: "Generated 2h ago",
            },
          ]
        : [];
    return {
      beatNumber: options.beatNumber,
      candidateCount: candidates.length,
      candidates,
      deletePending: false,
      downloadUrl,
      hasGeneratedVideo: Boolean(downloadUrl) || candidates.length > 0,
      previewSource: downloadUrl ? `${downloadUrl}#t=0.1` : null,
      selectionPending: false,
      state: options.state,
      useVideoReferencePreview: options.useVideoReferencePreview,
      videoActive: options.videoActive,
      videoTask: { status: options.videoActive ? 'running' as const : 'idle' as const, progress: options.videoProgress },
      deleteCandidate: async () => undefined,
      selectCandidate: async (poolId: string) => {
        await poolSelectMock({ beatNum: options.beatNumber, poolId });
      },
    };
  };
  const useVideoModels = () => ({
    data: [
      {
        value: "video-model-standard-a",
        label: "Video Model Standard",
        workflow: "standard" as const,
        supportsAdvancedConfig: false,
        supportsNativeAudio: false,
        dialogueOnly: false,
        referenceImageMax: 1,
        minDuration: 4,
        maxDuration: 12,
      },
      {
        value: "video-model-standard",
        label: "Video Model Standard",
        workflow: "standard" as const,
        supportsAdvancedConfig: false,
        supportsNativeAudio: false,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 12,
      },
      {
        value: "video-model-standard-b",
        label: "Video Model Dialogue",
        workflow: "standard" as const,
        supportsAdvancedConfig: false,
        supportsNativeAudio: false,
        dialogueOnly: true,
        minDuration: 4,
        maxDuration: 12,
      },
      {
        value: "video-model-dialogue",
        label: "Video Model Dialogue",
        workflow: "standard" as const,
        supportsAdvancedConfig: false,
        supportsNativeAudio: false,
        dialogueOnly: true,
        minDuration: 4,
        maxDuration: 12,
      },
      {
        value: "video-model-advanced-a",
        label: "Video Model Reference",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["720p"],
      },
      {
        value: "video-model-reference",
        label: "Video Model Reference",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["720p"],
      },
      {
        value: "video-model-advanced-b",
        label: "Video Model Reference Pro",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["480p", "720p", "1080p"],
      },
      {
        value: "video-model-reference-pro",
        label: "Video Model Reference Pro",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["480p", "720p", "1080p"],
      },
      {
        value: "video-model-advanced-c",
        label: "Video Model Value",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["720p", "1080p"],
        sceneOptimizeOptions: ["anime", "realistic"],
      },
      {
        value: "video-model-value",
        label: "Video Model Value",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["720p", "1080p"],
        sceneOptimizeOptions: ["anime", "realistic"],
      },
      {
        value: "video-model-advanced-d",
        label: "Video Model Fast Value",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
      },
      {
        value: "video-model-fast-value",
        label: "Video Model Fast Value",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
      },
      {
        value: "cloud-video-reference",
        label: "Video Model Reference",
        workflow: "advanced-reference" as const,
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        dialogueOnly: false,
        minDuration: 4,
        maxDuration: 15,
      },
    ],
  });
  const useVideoPaneController = createUseVideoPaneController(
    {
      useVideoReferenceBeatStatus: videoQueryMocks.useVideoReferenceBeatStatus,
      useVideoModels,
    },
    {
      useBeatVideoGenerationController,
      useBasicVideoPromptController,
      useProjectAspectRatio,
      useVideoReferenceAssetOperationsController,
      useBeatVideoConfigController,
      useVideoReferenceMentionController,
      useVideoPaneMediaController,
    },
  );
  return {
    useVideoPaneController,
  };
});

vi.mock("@/modules/narrative_planning/public", () => ({
  useUpdateBeat: () => ({
    mutateAsync: updateBeatMock,
    isPending: false,
  }),
}));

vi.mock("@/modules/task_execution/public", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  useTaskController: () => ({
    start: taskStartMock,
    started: false,
  }),
}));

vi.mock("@/shared/hooks/use-now", () => ({
  useNow: () => new Date("2026-05-16T10:30:00Z"),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeBeat(overrides: Partial<Beat> = {}): Beat {
  return {
    beat_number: 1,
    narration_segment: "旁白",
    visual_description: "画面",
    audio_type: "narration",
    video_mode: "first_frame",
    detected_identities: ["陆辰_青年时期"],
    video_prompt: "base video prompt",
    keyframe_prompt: "",
    frame_url: "/static/frame.png",
    audio_url: "/static/audio.mp3",
    video_url: "/static/new.mp4",
    video_config_json: JSON.stringify({
      mode: "multimodal_reference",
      duration: 5,
      resolution: "720p",
      ratio: "9:16",
      generate_audio: false,
      return_last_frame: false,
      human_review: false,
      prompt_source: "generated",
      final_prompt: "existing videoReference prompt",
      text_overlay: {
        enabled: false,
        kind: "caption",
        content: "",
        placement: "center",
        timing: "auto",
        style: "",
      },
    }),
    ...overrides,
  };
}

function renderPane(
  beat: Beat = makeBeat(),
  options: { showAudioMediaStatus?: boolean; defaultModel?: string } = {},
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <VideoPane
        beat={beat}
        project="demo"
        episode={1}
        state="ready"
        defaultModel={options.defaultModel ?? "video-model-reference"}
        showAudioMediaStatus={options.showAudioMediaStatus}
      />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  videoQueryMockState.hideReturnedLastFrame = false;
  videoQueryMockState.includeAudioAsset = false;
  videoQueryMockState.invalidVoiceAsset = false;
  videoQueryMockState.videoReferenceAssetsOverride = null;
  useAspectRatioStore.getState().reset();
  updateBeatMock.mockReset();
  updateBeatMock.mockResolvedValue({ ok: true, data: makeBeat() });
  regenerateMock.mockReset();
  regenerateMock.mockResolvedValue({ ok: true, task_id: "task-1" });
  poolSelectMock.mockReset();
  taskStartMock.mockReset();
  deleteNarratorVoiceMock.mockReset();
  deleteNarratorVoiceMock.mockResolvedValue({ ok: true, data: {} });
  cropVideoReferenceAssetMock.mockReset();
  cropVideoReferenceAssetMock.mockResolvedValue({ ok: true, data: {} });
  trimVideoReferenceAssetMock.mockReset();
  trimVideoReferenceAssetMock.mockResolvedValue({ ok: true, data: {} });
  generateVideoPromptMock.mockReset();
  generateVideoPromptMock.mockResolvedValue({
    ok: true,
    task_type: "videoReference_prompt",
    task_id: "task-video-reference-prompt",
    task_key: "task:videoReference_prompt:1:1",
    message: "第 1 集 Beat 1 视频提示词优化已入队",
  });
  generateBeatVideoPromptMock.mockReset();
  generateBeatVideoPromptMock.mockResolvedValue({
    ok: true,
    data: {
      field: "video_prompt",
      prompt: "generated 1.x motion prompt",
      beat: makeBeat({ video_prompt: "generated 1.x motion prompt" }),
    },
  });
});

async function waitForVideoReferenceAutosave(times = 1) {
  await waitFor(() => expect(updateBeatMock).toHaveBeenCalledTimes(times), {
    timeout: 2000,
  });
}

function expandVideoReferences() {
  const trigger = screen.getByRole("button", { name: /参考素材详情/ });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
}

describe("VideoPane VideoReference inspector", () => {
  it("distinguishes an unconfigured model prompt from a missing file", () => {
    renderPane(makeBeat({ video_config_json: "{}" }));

    expect(screen.getByText("模型提示词未配置")).toBeInTheDocument();
    expect(screen.queryByText("文件缺失")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "模型专用提示词" },
    });
    expect(screen.getByText("模型提示词已配置")).toBeInTheDocument();
    expect(screen.queryByText("模型提示词未配置")).not.toBeInTheDocument();
  });

  it("renders and saves the 1.x video prompt while showing image-only reference details", () => {
    videoQueryMockState.includeAudioAsset = true;
    renderPane(
      makeBeat({
        video_mode: "first_frame",
        video_prompt: "base video prompt",
      }),
      { defaultModel: "video-model-standard-a" },
    );

    expect(screen.queryByText("VideoReference Inspector")).not.toBeInTheDocument();
    expect(screen.getByLabelText("视频提示词")).toHaveValue("base video prompt");
    expect(screen.getByRole("button", { name: /参考素材详情/ })).toBeInTheDocument();
    expect(screen.getByText("当前 render · Beat 1")).toBeInTheDocument();
    expect(screen.queryByText("手动素材 2")).not.toBeInTheDocument();
    expect(screen.queryByText("项目解说声线")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上传素材" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("生成模式")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("视频提示词"), {
      target: { value: "updated motion prompt" },
    });
    fireEvent.blur(screen.getByLabelText("视频提示词"));

    expect(updateBeatMock).toHaveBeenCalledWith({
      beatNum: 1,
      data: { video_prompt: "updated motion prompt" },
    });
  });

  it("uses a 9:16 video-input crop for 1.x when the project aspect is 2:3", async () => {
    const user = userEvent.setup();
    renderPane(
      makeBeat({
        video_mode: "first_frame",
        video_prompt: "base video prompt",
      }),
      { defaultModel: "video-model-standard-a" },
    );
    expandVideoReferences();

    await user.click(screen.getAllByRole("button", { name: "裁剪" })[0]);

    expect(await screen.findByText("裁剪 9:16")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2:3" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "16:9" })).not.toBeInTheDocument();
  });

  it("generates a single 1.x beat video prompt from the video pane", async () => {
    const user = userEvent.setup();
    renderPane(
      makeBeat({ video_mode: "first_frame", video_prompt: "" }),
      { defaultModel: "video-model-standard-a" },
    );

    const promptButton = screen.getByRole("button", {
      name: "生成本 Beat 提示词",
    });
    await user.click(promptButton);

    expect(generateBeatVideoPromptMock).toHaveBeenCalledWith({ beatNum: 1 });
    expect(screen.getByLabelText("视频提示词")).toHaveValue(
      "generated 1.x motion prompt",
    );
  });

  it("treats async 1.x beat video prompt task startup as success", async () => {
    const user = userEvent.setup();
    generateBeatVideoPromptMock.mockResolvedValueOnce({
      ok: true,
      task_type: "beat_video_prompt",
      task_id: "task-prompt-1",
      task_key: "task:beat_video_prompt:project:proj_123:1:beat:1",
      message: "第 1 集 Beat 1 提示词生成已入队",
    });
    renderPane(
      makeBeat({ video_mode: "first_frame", video_prompt: "" }),
      { defaultModel: "video-model-standard-a" },
    );

    await user.click(screen.getByRole("button", { name: "生成本 Beat 提示词" }));

    expect(generateBeatVideoPromptMock).toHaveBeenCalledWith({ beatNum: 1 });
    expect(screen.getByLabelText("视频提示词")).toHaveValue("");
    expect(toast.success).toHaveBeenCalledWith(
      "本 Beat 视频提示词生成已启动",
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      "本 Beat 视频提示词生成失败",
    );
  });

  it("renders keyframe prompt editing for 1.x keyframe beats", () => {
    renderPane(
      makeBeat({
        video_mode: "keyframe",
        video_prompt: "first frame prompt",
        keyframe_prompt: "transition prompt",
      }),
      { defaultModel: "video-model-standard-a" },
    );

    expect(screen.getByLabelText("单个 Beat 视频提示词")).toHaveValue(
      "transition prompt",
    );

    fireEvent.change(screen.getByLabelText("单个 Beat 视频提示词"), {
      target: { value: "updated transition prompt" },
    });
    fireEvent.blur(screen.getByLabelText("单个 Beat 视频提示词"));

    expect(updateBeatMock).toHaveBeenCalledWith({
      beatNum: 1,
      data: { keyframe_prompt: "updated transition prompt" },
    });
  });

  it("does not show legacy 1.x prompt controls for VideoReference backends", () => {
    renderPane(makeBeat());

    expect(screen.getByText("Video Model Reference 检视器")).toBeInTheDocument();
    expect(screen.queryByLabelText("视频提示词")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("单个 Beat 视频提示词")).not.toBeInTheDocument();
  });

  it("blocks 1.x video generation when the beat video prompt is empty", async () => {
    const user = userEvent.setup();
    renderPane(
      makeBeat({ video_url: null, video_mode: "first_frame", video_prompt: "" }),
      { defaultModel: "video-model-standard-a" },
    );

    await user.click(screen.getByRole("button", { name: "重新生成" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Beat #1 缺少视频提示词，请先点击“生成本 Beat 提示词”。",
    );
    expect(screen.queryByText("生成视频？")).not.toBeInTheDocument();
    expect(regenerateMock).not.toHaveBeenCalled();
  });

  it("blocks VideoReference video generation when final prompt is empty", async () => {
    const user = userEvent.setup();
    renderPane(
      makeBeat({
        video_url: null,
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          duration: 5,
          resolution: "720p",
          ratio: "9:16",
          final_prompt: "",
        }),
      }),
    );

    await user.click(screen.getAllByRole("button", { name: "重新生成" })[0]);

    expect(toast.error).toHaveBeenCalledWith(
      "Beat #1 缺少 VideoReference.0主体提示词，请先填写或点击“AI 优化”。",
    );
    expect(screen.queryByText("生成视频？")).not.toBeInTheDocument();
    expect(regenerateMock).not.toHaveBeenCalled();
  });

  it("surfaces backend validation errors for single beat video generation", async () => {
    const user = userEvent.setup();
    regenerateMock.mockResolvedValueOnce({
      ok: false,
      error: "Beat 1 不是 dialogue，Video Model Dialogue 有声只允许用于 dialogue beat",
    });
    renderPane();

    await user.click(screen.getAllByRole("button", { name: "重新生成" })[0]);
    await user.click(screen.getByRole("button", { name: "确认" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Beat 1 不是 dialogue，Video Model Dialogue 有声只允许用于 dialogue beat",
    );
    expect(taskStartMock).not.toHaveBeenCalled();
  });

  it("saves the current VideoReference draft before regenerating video", async () => {
    const user = userEvent.setup();
    renderPane();

    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "draft prompt used for generation" },
    });
    fireEvent.change(screen.getByLabelText("时长"), {
      target: { value: "8" },
    });
    await user.click(screen.getAllByRole("button", { name: "重新生成" })[0]);
    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => expect(updateBeatMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(regenerateMock).toHaveBeenCalledTimes(1));
    expect(updateBeatMock.mock.invocationCallOrder[0]).toBeLessThan(
      regenerateMock.mock.invocationCallOrder[0],
    );
    const payload = updateBeatMock.mock.calls[0][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config).toMatchObject({
      final_prompt: "draft prompt used for generation",
      duration: 8,
    });
  });

  it("clamps VideoReference duration to the selected backend bounds before saving", async () => {
    const user = userEvent.setup();
    renderPane();

    const durationInput = screen.getByLabelText("时长");
    expect(durationInput).toHaveAttribute("min", "4");
    expect(durationInput).toHaveAttribute("max", "15");

    fireEvent.change(durationInput, {
      target: { value: "3" },
    });
    await user.click(screen.getAllByRole("button", { name: "重新生成" })[0]);
    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => expect(updateBeatMock).toHaveBeenCalledTimes(1));
    const payload = updateBeatMock.mock.calls[0][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.duration).toBe(4);
  });

  it("renders VideoReference media, config, and version status", () => {
    renderPane();

    expect(screen.getByText("Video Model Reference 检视器")).toBeInTheDocument();
    expect(screen.queryByText("媒体状态")).not.toBeInTheDocument();
    expect(screen.queryByText("Prompt 状态")).not.toBeInTheDocument();
    expect(screen.queryByText("配置状态")).not.toBeInTheDocument();
    expect(screen.getByText("视频版本（2）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /参考素材详情/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("图片1")).toBeInTheDocument();
    expect(screen.getByText("手动素材 7")).toBeInTheDocument();
    expect(screen.getByText("当前 render · Beat 1")).toBeInTheDocument();
    expect(screen.getByText("陆辰 · 青年时期")).toBeInTheDocument();
    expect(screen.getByText("有图时作为角色身份图保持一致")).toBeInTheDocument();
    expect(screen.getByText("参考图")).toBeInTheDocument();
    expect(screen.getByText("缺参考图")).toBeInTheDocument();
    expect(screen.queryByText("未发送")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传素材" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "插入引用" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "裁剪" }).length).toBeGreaterThan(0);
    expect(screen.getByText("声线就绪")).toBeInTheDocument();
    expect(
      screen.getAllByText("4 已选择 · 1 未引用 · 1 文本替代").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "画面文字" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "VideoReference 预览模式" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "音频" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Render").length).toBeGreaterThan(0);
    expect(screen.getByText("模型提示词已配置")).toBeInTheDocument();
  });

  it("shows an existing but too-short voice as invalid instead of missing or unused", () => {
    const validationError =
      "参考声线只有 1.04 秒，VideoReference 要求至少 1.8 秒。";
    videoQueryMockState.invalidVoiceAsset = true;
    videoQueryMockState.videoReferenceAssetsOverride = [
      {
        key: "voice:白石夏音_学生时期",
        label: "白石夏音 · 学生时期声线",
        media_type: "audio",
        selected: false,
        exists: true,
        required: true,
        state: "invalid",
        reference_label: "未发送",
        note: "VideoReference 对白参考声线",
        status_detail: validationError,
        validation_error: validationError,
        path: "assets/characters/白石夏音/voices/voice_youth.wav",
        can_crop: false,
        can_trim: true,
        can_delete: false,
      },
    ];

    renderPane();

    expect(screen.getByText("声线不合规")).toBeInTheDocument();
    expect(screen.getAllByText("0 已选择 · 1 不合规").length).toBeGreaterThan(0);
    expect(
      screen.getByText("以下素材不可用于本次请求，请先处理："),
    ).toBeInTheDocument();
    expect(screen.getAllByText(validationError).length).toBeGreaterThan(0);
    expect(screen.getByText("不合规")).toBeInTheDocument();
    expect(screen.queryByText("0 已选择 · 1 文件缺失")).not.toBeInTheDocument();
    expect(screen.queryByText("未引用")).not.toBeInTheDocument();
  });

  it("keeps a required legacy asset missing even when fallback text is present", () => {
    videoQueryMockState.videoReferenceAssetsOverride = [
      {
        key: "identity:陆辰_青年时期",
        label: "陆辰 · 青年时期",
        media_type: "image",
        selected: false,
        exists: false,
        required: true,
        reference_label: "未发送",
        note: "角色身份图缺失",
        fallback_text: "使用角色文本身份描述",
      },
    ];

    renderPane();

    expect(screen.getByText("缺失")).toBeInTheDocument();
    expect(screen.queryByText("缺参考图")).not.toBeInTheDocument();
  });

  it("renders a single VideoReference video generation action", () => {
    renderPane(makeBeat({ beat_number: 2, video_url: null }));

    expect(screen.getAllByRole("button", { name: "生成视频" })).toHaveLength(1);
  });

  it("shows image thumbnails in the VideoReference reference details", () => {
    renderPane();
    expandVideoReferences();

    expect(screen.getByAltText("当前 render · Beat 1")).toHaveAttribute(
      "src",
      "/static/demo/frames/ep001/beat_01.png",
    );
    expect(screen.getByAltText("手动素材 2")).toHaveAttribute(
      "src",
      "/static/demo/video-reference/manual_02.png",
    );
    expect(
      screen.getByAltText("手动素材 2").closest("[data-video-reference-reference-tile]"),
    ).toHaveClass("aspect-square", "w-[6.75rem]");
    expect(
      screen.getByAltText("手动素材 2").closest("[data-video-reference-reference-tile]")?.parentElement,
    ).toHaveClass("grid-cols-[repeat(auto-fill,minmax(6.75rem,6.75rem))]");
    expect(screen.getByAltText("手动素材 2")).toHaveClass("object-cover");
  });

  it("hides the audio media status when disabled for drama projects", () => {
    renderPane(makeBeat(), { showAudioMediaStatus: false });

    expect(screen.getAllByText("Render").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "音频" })).not.toBeInTheDocument();
  });

  it("shows readable backend labels on video version thumbnails", () => {
    renderPane();

    expect(screen.getAllByText("VideoReference.0 Fast").length).toBeGreaterThan(0);
    expect(screen.queryByText("video-model-advanced-a")).not.toBeInTheDocument();
  });

  it("shows scene optimize styles only for VideoReference value models", async () => {
    const user = userEvent.setup();
    renderPane(makeBeat({ video_config_json: "" }), {
      defaultModel: "video-model-advanced-c",
    });

    expect(screen.getByRole("radiogroup", { name: "风格" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "动漫" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("radio", { name: "写实" }));
    await waitForVideoReferenceAutosave();

    const payload =
      updateBeatMock.mock.calls[updateBeatMock.mock.calls.length - 1][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.scene_optimize).toBe("realistic");
  });

  it("uses model-specific VideoReference resolution options", async () => {
    const user = userEvent.setup();
    renderPane(makeBeat({ video_config_json: "" }), {
      defaultModel: "video-model-advanced-b",
    });

    await user.click(screen.getByRole("combobox", { name: "分辨率" }));
    expect(await screen.findByRole("option", { name: "480p" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "720p" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1080p" })).toBeInTheDocument();
  });

  it("hides unsupported VideoReference value resolution options", async () => {
    const user = userEvent.setup();
    renderPane(makeBeat({ video_config_json: "" }), {
      defaultModel: "video-model-advanced-c",
    });

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "动漫" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    await user.click(screen.getByLabelText("分辨率"));
    expect(await screen.findByRole("option", { name: "720p" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "480p" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1080p" })).toBeInTheDocument();
  });

  it("normalizes unsupported saved VideoReference value resolution", async () => {
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          resolution: "480p",
          final_prompt: "existing videoReference prompt",
        }),
      }),
      { defaultModel: "video-model-advanced-c" },
    );

    await waitForVideoReferenceAutosave();

    const payload =
      updateBeatMock.mock.calls[updateBeatMock.mock.calls.length - 1][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.resolution).toBe("720p");
  });

  it("normalizes VideoReference resolution before generation after backend switches", async () => {
    const user = userEvent.setup();
    const beat = makeBeat({
      video_config_json: JSON.stringify({
        mode: "multimodal_reference",
        duration: 5,
        resolution: "1080p",
        ratio: "9:16",
        final_prompt: "existing videoReference prompt",
      }),
    });
    const view = renderPane(beat, {
      defaultModel: "video-model-advanced-b",
    });

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <VideoPane
          beat={beat}
          project="demo"
          episode={1}
          state="ready"
          defaultModel="video-model-advanced-a"
        />
      </I18nextProvider>,
    );
    await user.click(screen.getAllByRole("button", { name: "重新生成" })[0]);
    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => expect(regenerateMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(updateBeatMock).toHaveBeenCalled());
    const saveBeforeRegenerateIndex = updateBeatMock.mock.invocationCallOrder.findIndex(
      (order) => order < regenerateMock.mock.invocationCallOrder[0],
    );
    expect(saveBeforeRegenerateIndex).toBeGreaterThanOrEqual(0);
    const payload = updateBeatMock.mock.calls[saveBeforeRegenerateIndex][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.resolution).toBe("720p");
    expect(updateBeatMock.mock.invocationCallOrder[saveBeforeRegenerateIndex]).toBeLessThan(
      regenerateMock.mock.invocationCallOrder[0],
    );
  });

  it("hides scene optimize styles for non-value VideoReference models", () => {
    renderPane();

    expect(screen.queryByRole("radiogroup", { name: "风格" })).not.toBeInTheDocument();
  });

  it("does not expose raw VideoReference mode names in the VideoReference controls", () => {
    renderPane();

    expect(screen.getByText("模型提示词已配置")).toBeInTheDocument();
    expect(screen.getByLabelText("生成模式")).toHaveTextContent("多参模式");
    expect(screen.queryByText("multimodal_reference")).not.toBeInTheDocument();
  });

  it("uses first-generation confirmation copy when the beat has no video", async () => {
    const user = userEvent.setup();
    renderPane(makeBeat({ beat_number: 2, video_url: null }));

    await user.click(screen.getAllByRole("button", { name: "生成视频" })[0]);

    expect(screen.getByText("生成视频？")).toBeInTheDocument();
    expect(
      screen.getByText("已仔细检查参考图与提示词，将为 Beat #2 生成视频片段。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("重新生成视频？")).not.toBeInTheDocument();
  });

  it("uses the VideoReference configured ratio for multimodal image asset crops", async () => {
    const user = userEvent.setup();
    useAspectRatioStore.getState().setOrientation("demo", "landscape");
    renderPane();
    expandVideoReferences();

    await user.click(screen.getAllByRole("button", { name: "裁剪" })[0]);
    expect(await screen.findByText("裁剪 9:16")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "16:9" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("X")).not.toBeInTheDocument();

    const image = screen
      .getAllByAltText("当前 render · Beat 1")
      .find((element) => element.closest('[role="dialog"]'));
    if (!image) throw new Error("crop image not found");
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 569,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 839,
    });
    fireEvent.load(image);

    await waitFor(() => {
      const cropArea = screen.getByLabelText("移动裁剪区域");
      expect(Number.parseFloat(cropArea.style.left)).toBeCloseTo(
        8.611599297012302,
      );
      expect(Number.parseFloat(cropArea.style.width)).toBeCloseTo(
        82.95254833040421,
      );
      expect(cropArea).toHaveStyle({ top: "0%", height: "100%" });
    });

    const cropButtons = screen.getAllByRole("button", { name: "裁剪" });
    await user.click(cropButtons[cropButtons.length - 1]);
    expect(cropVideoReferenceAssetMock).toHaveBeenCalledWith({
      beatNum: 1,
      assetKey: "first_frame",
      sourcePath: "frames/ep001/beat_01.png",
      target: "first_frame",
      crop: { x: 49, y: 0, width: 472, height: 839 },
    });
  });

  it("maps 2:3 first-frame VideoReference crops to 9:16 video input", async () => {
    const user = userEvent.setup();
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "first_frame",
          final_prompt: "wide video prompt",
          ratio: "16:9",
        }),
      }),
    );
    expandVideoReferences();

    await user.click(screen.getAllByRole("button", { name: "裁剪" })[0]);
    expect(await screen.findByText("裁剪 9:16")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "16:9" })).not.toBeInTheDocument();

    const image = screen
      .getAllByAltText("当前 render · Beat 1")
      .find((element) => element.closest('[role="dialog"]'));
    if (!image) throw new Error("crop image not found");
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 569,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 839,
    });
    fireEvent.load(image);

    await waitFor(() => {
      const cropArea = screen.getByLabelText("移动裁剪区域");
      expect(Number.parseFloat(cropArea.style.left)).toBeCloseTo(
        8.611599297012302,
      );
      expect(Number.parseFloat(cropArea.style.width)).toBeCloseTo(
        82.95254833040421,
      );
      expect(cropArea).toHaveStyle({ top: "0%", height: "100%" });
    });

    const cropButtons = screen.getAllByRole("button", { name: "裁剪" });
    await user.click(cropButtons[cropButtons.length - 1]);
    expect(cropVideoReferenceAssetMock).toHaveBeenCalledWith({
      beatNum: 1,
      assetKey: "first_frame",
      sourcePath: "frames/ep001/beat_01.png",
      target: "first_frame",
      crop: { x: 49, y: 0, width: 472, height: 839 },
    });
  });

  it("keeps using the original render as crop source after a video-input override exists", async () => {
    const user = userEvent.setup();
    videoQueryMockState.videoReferenceAssetsOverride = [
      {
        key: "first_frame",
        label: "当前 render · Beat 1",
        media_type: "image",
        selected: true,
        exists: true,
        reference_label: "图片1",
        note: "首帧模式只发送这一张首帧图，不混用参考图。",
        path: "video_inputs/ep001/beat_01/first_frame.png",
        url: "/static/demo/video_inputs/ep001/beat_01/first_frame.png",
        abs_path: "/project/video_inputs/ep001/beat_01/first_frame.png",
        crop_source_path: "frames/ep001/beat_01.png",
        crop_source_abs_path: "/project/frames/ep001/beat_01.png",
        crop_source_url: "/static/demo/frames/ep001/beat_01.png",
        can_crop: true,
        can_delete: false,
      },
    ];
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "first_frame",
          final_prompt: "wide video prompt",
        }),
      }),
    );
    expandVideoReferences();

    await user.click(screen.getAllByRole("button", { name: "裁剪" })[0]);
    await screen.findByRole("dialog");
    const cropImage = screen
      .getAllByAltText("当前 render · Beat 1")
      .find((element) => element.closest('[role="dialog"]'));
    if (!cropImage) throw new Error("crop image not found");
    expect(cropImage).toHaveAttribute("src", "/static/demo/frames/ep001/beat_01.png");
    // Happy DOM never decodes images, so the dialog's onLoad would never fire and
    // saving stays disabled until a real crop box exists. Simulate the decode a
    // browser performs.
    Object.defineProperty(cropImage, "naturalWidth", {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(cropImage, "naturalHeight", {
      configurable: true,
      value: 1080,
    });
    fireEvent.load(cropImage);
    const cropButtons = await screen.findAllByRole("button", { name: "裁剪" });
    await user.click(cropButtons[cropButtons.length - 1]);

    expect(cropVideoReferenceAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetKey: "first_frame",
        target: "first_frame",
        sourcePath: "/project/frames/ep001/beat_01.png",
      }),
    );
  });

  it("keeps 16:9 first-frame VideoReference crops at 16:9 video input", async () => {
    const user = userEvent.setup();
    useAspectRatioStore.getState().setOrientation("demo", "landscape");
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "first_frame",
          final_prompt: "wide video prompt",
          ratio: "9:16",
        }),
      }),
    );
    expandVideoReferences();

    await user.click(screen.getAllByRole("button", { name: "裁剪" })[0]);
    expect(await screen.findByText("裁剪 16:9")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "9:16" })).not.toBeInTheDocument();
  });

  it("allows trimming VideoReference audio reference assets", async () => {
    const user = userEvent.setup();
    videoQueryMockState.includeAudioAsset = true;
    renderPane();
    expandVideoReferences();

    const audioTile = screen
      .getByText("项目解说声线")
      .closest("[data-video-reference-reference-tile]");
    if (!audioTile) throw new Error("audio tile not found");
    await user.click(within(audioTile as HTMLElement).getByRole("button", { name: "裁剪" }));
    await user.click(screen.getByRole("button", { name: "裁剪到 3-5 秒" }));

    expect(trimVideoReferenceAssetMock).toHaveBeenCalledWith({
      beatNum: 1,
      assetKey: "voice:narrator",
      sourcePath: "/project/assets/narrator/voice.mp3",
      startSeconds: 0,
      durationSeconds: 4,
    });
  });

  it("autosaves prompt and basic VideoReference config as one JSON patch", async () => {
    renderPane();

    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "new videoReference prompt" },
    });
    fireEvent.change(screen.getByLabelText("时长"), {
      target: { value: "8" },
    });
    await waitForVideoReferenceAutosave();

    const payload = updateBeatMock.mock.calls[0][0];
    expect(payload.beatNum).toBe(1);
    const config = JSON.parse(payload.data.video_config_json);
    expect(config).toMatchObject({
      final_prompt: "new videoReference prompt",
      duration: 8,
      generate_audio: true,
      human_review: false,
      mode: "multimodal_reference",
      resolution: "720p",
      ratio: "9:16",
    });
    expect(screen.queryByRole("checkbox", { name: "生成声音" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "真人审核" })).not.toBeInTheDocument();
  });

  it("autosave keeps the trailing space left by an inserted @mention", async () => {
    renderPane(makeBeat({ video_config_json: "" }));

    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "@图片1 @图片2 " },
    });
    await waitForVideoReferenceAutosave();

    const payload = updateBeatMock.mock.calls[0][0];
    const config = JSON.parse(payload.data.video_config_json);
    // The trailing separator must survive the save → re-parse → draft-reset
    // round-trip, otherwise the next reference glues onto the last one.
    expect(config.final_prompt).toBe("@图片1 @图片2 ");
  });

  it("defaults new VideoReference drafts to the project render aspect", async () => {
    useAspectRatioStore.getState().setOrientation("demo", "landscape");
    renderPane(makeBeat({ video_config_json: "" }));

    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "new landscape prompt" },
    });
    await waitForVideoReferenceAutosave();

    const payload = updateBeatMock.mock.calls[0][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.ratio).toBe("16:9");
  });

  it("inserts the highlighted @ mention candidate when pressing Enter", async () => {
    renderPane();
    const textarea = (await screen.findByLabelText(
      "VideoReference.0主体提示词",
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "@" } });
    expect(await screen.findByText("引用候选")).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => expect(textarea.value).toContain("@图片1"));
  });

  it("navigates @ mention candidates with arrows and inserts on Tab", async () => {
    renderPane();
    const textarea = (await screen.findByLabelText(
      "VideoReference.0主体提示词",
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "@" } });
    expect(await screen.findByText("引用候选")).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "Tab" });
    await waitFor(() => expect(textarea.value).toContain("@图片2"));
  });

  it("keeps already-inserted references available in the @ mention dropdown", async () => {
    renderPane();
    const textarea = (await screen.findByLabelText(
      "VideoReference.0主体提示词",
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "@图片1 @" } });
    expect(await screen.findByText("引用候选")).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: "Enter" });
    // Selecting a mention appends a trailing space so the next keystroke can't
    // glue onto it.
    await waitFor(() => expect(textarea.value).toBe("@图片1 @图片1 "));
  });

  it("autosaves VideoReference mode changes so reference assets refresh by mode", async () => {
    const user = userEvent.setup();
    renderPane();

    const modeTrigger = screen.getByLabelText("生成模式");
    expect(modeTrigger).toHaveTextContent("多参模式");
    expect(modeTrigger).not.toHaveTextContent("multimodal_reference");
    await user.click(modeTrigger);
    expect(await screen.findByRole("option", { name: "首帧模式" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "首尾帧模式" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "多参模式" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "first_last_frame" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "首尾帧模式" }));
    await waitForVideoReferenceAutosave();

    const payload = updateBeatMock.mock.calls[0][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.mode).toBe("first_last_frame");
  });

  it("does not render manual VideoReference save actions", () => {
    renderPane();

    expect(screen.queryByRole("button", { name: "保存配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存prompt" })).not.toBeInTheDocument();
  });

  it("keeps VideoReference API audio generation enabled by default", async () => {
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          generate_audio: true,
          final_prompt: "video prompt with generated audio",
        }),
      }),
    );

    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "videoReference prompt with generated audio" },
    });
    await waitForVideoReferenceAutosave();

    const payload = updateBeatMock.mock.calls[0][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.generate_audio).toBe(true);
  });

  it("shows and downloads the returned last frame when enabled", () => {
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          duration: 5,
          resolution: "720p",
          ratio: "9:16",
          generate_audio: false,
          return_last_frame: true,
          human_review: false,
          final_prompt: "existing videoReference prompt",
        }),
      }),
    );

    const image = screen
      .getAllByAltText("返回尾帧 · Beat 1")
      .find((element) => element.closest("[data-video-reference-returned-last-frame]"));
    if (!image) throw new Error("returned last frame image not found");
    const panel = image.closest("[data-video-reference-returned-last-frame]");

    expect(image).toHaveAttribute(
      "src",
      "/static/demo/video-reference/beat_01_last_frame.png",
    );
    expect(panel).toBeTruthy();
    expect(within(panel as HTMLElement).getByRole("link", { name: "下载" })).toHaveAttribute(
      "href",
      "/static/demo/video-reference/beat_01_last_frame.png",
    );
  });

  it("shows a returned last frame image box before the image is ready", () => {
    videoQueryMockState.hideReturnedLastFrame = true;

    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          duration: 5,
          resolution: "720p",
          ratio: "9:16",
          generate_audio: false,
          return_last_frame: true,
          human_review: false,
          final_prompt: "existing videoReference prompt",
        }),
      }),
    );

    const panel = screen.getByTestId("video-reference-returned-last-frame-panel");
    const box = screen.getByTestId("video-reference-returned-last-frame-box");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass("w-fit", "max-w-full");
    expect(box).toHaveClass("w-[7.5rem]", "max-w-full");
    expect(box).toHaveStyle({ aspectRatio: "9 / 16" });
    expect(within(panel).getByText("等待生成尾帧")).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: "下载" })).not.toBeInTheDocument();
  });

  it("opens VideoReference mention candidates when typing @ and inserts the selected reference", async () => {
    const user = userEvent.setup();
    renderPane();

    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "镜头推进 @" },
    });
    expect(screen.getByText("引用候选")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "@图片1" }));

    expect(screen.getByLabelText("VideoReference.0主体提示词")).toHaveValue("镜头推进 @图片1 ");
  });

  it("appends a space when picking consecutive references via the popover", async () => {
    const user = userEvent.setup();
    renderPane();
    const textarea = screen.getByLabelText(
      "VideoReference.0主体提示词",
    ) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "@" } });
    await user.click(screen.getByRole("button", { name: "@图片1" }));
    expect(textarea).toHaveValue("@图片1 ");

    fireEvent.change(textarea, { target: { value: "@图片1 @" } });
    await user.click(screen.getByRole("button", { name: "@图片2" }));
    expect(textarea).toHaveValue("@图片1 @图片2 ");
  });

  it("keeps a space after every popover pick when typing @ between them", async () => {
    const user = userEvent.setup();
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          final_prompt: "",
        }),
      }),
    );
    const textarea = screen.getByLabelText(
      "VideoReference.0主体提示词",
    ) as HTMLTextAreaElement;

    await user.click(textarea);
    await user.type(textarea, "@");
    await user.click(screen.getByRole("button", { name: "@图片1" }));
    await user.type(textarea, "@");
    await user.click(screen.getByRole("button", { name: "@图片2" }));

    expect(textarea.value).toBe("@图片1 @图片2 ");
  });

  it("inserts an @ reference when dragging a reference image into the prompt editor", () => {
    renderPane();
    expandVideoReferences();
    const image = screen.getByAltText("手动素材 2");
    const textarea = screen.getByLabelText("VideoReference.0主体提示词");
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ""),
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.dragStart(image, { dataTransfer });
    fireEvent.drop(textarea, { dataTransfer });

    expect(textarea).toHaveValue("existing videoReference prompt\n@图片2 ");
  });

  it("makes uploaded image and audio reference tiles draggable", () => {
    videoQueryMockState.includeAudioAsset = true;
    renderPane();
    expandVideoReferences();
    const imageTile = screen
      .getByText("手动素材 2")
      .closest("[data-video-reference-reference-tile]");
    const audioTile = screen
      .getByText("项目解说声线")
      .closest("[data-video-reference-reference-tile]");
    if (!imageTile) throw new Error("image tile not found");
    if (!audioTile) throw new Error("audio tile not found");
    const textarea = screen.getByLabelText("VideoReference.0主体提示词");
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ""),
      effectAllowed: "",
      dropEffect: "",
    };

    expect(imageTile).toHaveAttribute("draggable", "true");
    expect(audioTile).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(audioTile, { dataTransfer });
    fireEvent.drop(textarea, { dataTransfer });

    expect(textarea).toHaveValue("existing videoReference prompt\n@音频1 ");
  });

  it("inserts a dragged @ reference at the prompt cursor position", () => {
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          final_prompt: "参考作为起始构图",
        }),
      }),
    );
    expandVideoReferences();
    const image = screen.getByAltText("手动素材 2");
    const textarea = screen.getByLabelText("VideoReference.0主体提示词") as HTMLTextAreaElement;
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ""),
      effectAllowed: "",
      dropEffect: "",
    };

    textarea.focus();
    textarea.setSelectionRange(2, 2);
    fireEvent.dragStart(image, { dataTransfer });
    fireEvent.drop(textarea, { dataTransfer });

    expect(textarea).toHaveValue("参考@图片2 作为起始构图");
  });

  it("uses the prompt cursor position from before dragging the image tile steals focus", () => {
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          final_prompt: "参考作为起始构图",
        }),
      }),
    );
    expandVideoReferences();
    const image = screen.getByAltText("手动素材 2");
    const textarea = screen.getByLabelText("VideoReference.0主体提示词") as HTMLTextAreaElement;
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ""),
      effectAllowed: "",
      dropEffect: "",
    };

    textarea.focus();
    textarea.setSelectionRange(2, 2);
    fireEvent.select(textarea);
    fireEvent.blur(textarea);
    fireEvent.dragStart(image, { dataTransfer });
    fireEvent.drop(textarea, { dataTransfer });

    expect(textarea).toHaveValue("参考@图片2 作为起始构图");
  });

  it("inserts a dragged reference even when the prompt already mentions it", () => {
    renderPane();
    expandVideoReferences();
    const image = screen.getByAltText("手动素材 2");
    const textarea = screen.getByLabelText("VideoReference.0主体提示词");
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ""),
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.change(textarea, { target: { value: "已有 @图片2" } });
    fireEvent.dragStart(image, { dataTransfer });
    fireEvent.drop(textarea, { dataTransfer });

    expect(textarea).toHaveValue("已有 @图片2 @图片2 ");
  });

  it("accepts browser image drags whose dragover data lacks the custom reference type", () => {
    renderPane();
    const textarea = screen.getByLabelText("VideoReference.0主体提示词");
    const dataTransfer = {
      types: ["text/plain"],
      getData: vi.fn((type: string) => (type === "text/plain" ? "@图片2" : "")),
      dropEffect: "",
    };

    expect(fireEvent.dragOver(textarea, { dataTransfer })).toBe(false);
    fireEvent.drop(textarea, { dataTransfer });

    expect(textarea).toHaveValue("existing videoReference prompt\n@图片2 ");
  });

  it("hides screen text overlay controls and disables stale overlay config on save", async () => {
    renderPane(
      makeBeat({
        video_config_json: JSON.stringify({
          final_prompt: "existing videoReference prompt",
          text_overlay: {
            enabled: true,
            kind: "speech_bubble",
            content: "鹿镇北口",
            placement: "画面下方居中",
            timing: "全片持续",
            style: "干净易读",
            speaker: "陆辰_青年时期",
          },
        }),
      }),
    );

    expect(screen.queryByRole("button", { name: "画面文字" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("文字内容")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "updated videoReference prompt" },
    });
    await waitForVideoReferenceAutosave();

    const payload = updateBeatMock.mock.calls[0][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.text_overlay).toMatchObject({
      enabled: false,
      kind: "speech_bubble",
      content: "鹿镇北口",
      placement: "画面下方居中",
      timing: "全片持续",
      style: "干净易读",
      speaker: "陆辰_青年时期",
    });
  });

  it("queues VideoReference prompt optimization from the current draft", async () => {
    const user = userEvent.setup();
    renderPane();

    fireEvent.change(screen.getByLabelText("自定义提示词"), {
      target: { value: "more camera motion" },
    });
    fireEvent.change(screen.getByLabelText("VideoReference.0主体提示词"), {
      target: { value: "manual reference prompt" },
    });
    const optimizeButton = screen.getByRole("button", { name: "AI 优化" });
    await user.click(optimizeButton);

    expect(generateVideoPromptMock).toHaveBeenCalledTimes(1);
    expect(generateVideoPromptMock).toHaveBeenCalledWith({
      beatNum: 1,
      manualPromptReference: "manual reference prompt",
      promptGuidance: "more camera motion",
    });
    expect(taskStartMock).toHaveBeenCalledWith({ scope: undefined, taskId: "task-video-reference-prompt" });
    expect(toast.success).toHaveBeenCalledWith(
      "第 1 集 Beat 1 视频提示词优化已入队",
    );
    expect(screen.getByLabelText("VideoReference.0主体提示词")).toHaveValue(
      "manual reference prompt",
    );
  });

  it("does not mutate the beat switched to while task submission is pending", async () => {
    const user = userEvent.setup();
    // Hold the optimize request open so we can switch beats before it resolves.
    let resolveOptimize: (value: unknown) => void = () => {};
    const deferred = new Promise((resolve) => {
      resolveOptimize = resolve;
    });
    generateVideoPromptMock.mockReturnValueOnce(deferred);

    const beatA = makeBeat({ beat_number: 1 });
    const beatB = makeBeat({
      beat_number: 2,
      video_config_json: JSON.stringify({
        mode: "multimodal_reference",
        duration: 5,
        resolution: "720p",
        ratio: "9:16",
        final_prompt: "beat two prompt",
      }),
    });
    const view = renderPane(beatA);

    // Trigger AI optimize on Beat A (request now pending).
    await user.click(screen.getByRole("button", { name: "AI 优化" }));
    expect(generateVideoPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({ beatNum: 1 }),
    );

    // User switches to Beat B while the optimize request is still in flight.
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <VideoPane
          beat={beatB}
          project="demo"
          episode={1}
          state="ready"
          defaultModel="cloud-video-reference"
        />
      </I18nextProvider>,
    );
    expect(screen.getByLabelText("VideoReference.0主体提示词")).toHaveValue(
      "beat two prompt",
    );

    // The optimize result for Beat A returns *after* the switch.
    resolveOptimize({
      ok: true,
      task_type: "videoReference_prompt",
      task_id: "task-video-reference-prompt",
      task_key: "task:videoReference_prompt:1:1",
      message: "第 1 集 Beat 1 视频提示词优化已入队",
    });

    await waitFor(() =>
      expect(taskStartMock).toHaveBeenCalledWith({ scope: undefined, taskId: "task-video-reference-prompt" }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "第 1 集 Beat 1 视频提示词优化已入队",
    );
    expect(screen.getByLabelText("VideoReference.0主体提示词")).toHaveValue(
      "beat two prompt",
    );
    const leakedToBeatB = updateBeatMock.mock.calls.some((call) => {
      try {
        return (
          JSON.parse(call[0].data.video_config_json).final_prompt ===
          "optimized videoReference prompt"
        );
      } catch {
        return false;
      }
    });
    expect(leakedToBeatB).toBe(false);
  });

  it("opens reference mention candidates from the custom prompt field", async () => {
    const user = userEvent.setup();
    renderPane();

    const guidance = screen.getByLabelText("自定义提示词");
    fireEvent.change(guidance, { target: { value: "保持 @" } });
    expect(screen.getByText("引用候选")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "@图片1" }));

    expect(guidance).toHaveValue("保持 @图片1 ");
  });

  it("inserts a dragged reference into the custom prompt field", () => {
    videoQueryMockState.includeAudioAsset = true;
    renderPane();
    expandVideoReferences();
    const audioTile = screen
      .getByText("项目解说声线")
      .closest("[data-video-reference-reference-tile]");
    if (!audioTile) throw new Error("audio tile not found");
    const guidance = screen.getByLabelText("自定义提示词");
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ""),
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.change(guidance, { target: { value: "声音参考：" } });
    fireEvent.dragStart(audioTile, { dataTransfer });
    fireEvent.drop(guidance, { dataTransfer });

    expect(guidance).toHaveValue("声音参考：@音频1 ");
  });

  it("places the AI optimize button in the main prompt input field", () => {
    renderPane();
    const promptField = screen.getByTestId("video-reference-prompt-panel");

    expect(promptField).toBeTruthy();
    expect(
      within(promptField as HTMLElement).getByRole("button", { name: "AI 优化" }),
    ).toBeInTheDocument();
  });

  it("appends and saves VideoReference prompt guidance templates without duplicates", async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(screen.getByRole("button", { name: "镜头" }));
    await user.click(screen.getByRole("button", { name: "镜头" }));

    const template =
      "镜头：说明景别、视角、运镜速度和运动方向，保持镜头运动清晰可执行。";
    expect(screen.getByLabelText("自定义提示词")).toHaveValue(template);
    await waitForVideoReferenceAutosave();
    const payload = updateBeatMock.mock.calls[0][0];
    const config = JSON.parse(payload.data.video_config_json);
    expect(config.prompt_guidance).toBe(template);
  });

  it("does not render project narrator voice management inside the video pane", () => {
    renderPane();

    expect(screen.queryByText("解说声线")).not.toBeInTheDocument();
    expect(screen.queryByText("第三人称项目解说声线")).not.toBeInTheDocument();
    expect(screen.queryByText("assets/narrator/voice.wav")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "项目音频" })).not.toBeInTheDocument();
    expect(deleteNarratorVoiceMock).not.toHaveBeenCalled();
  });
});
