// Copyright (c) 2026 AI anime
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { backendErrorToastMessage } from "@/shared/api/errors";
import { queryKeys } from "@/lib/query-keys";
import { useProject, useUpdateProject } from "@/modules/project_workspace/public";
import { useStyles } from "@/modules/asset_world/public";
import { useCancelTask, useTasks } from "@/modules/task_execution/public";
import { useTaskStream } from "@/modules/task_execution/public";
import type { StoryIntakeQueryHooks } from "@/modules/story_intake/application/query-hooks";
import type { ImportPreviewPreference } from "@/modules/story_intake/application/ports";
import {
  SPINE_TEMPLATE_OPTIONS,
  VISUAL_STYLE_OPTIONS,
} from "@/modules/story_intake/application/options";
import {
  INGEST_SETTING_FIELDS,
  hasIngestSettingsChanges,
  normalizeLegacyDefaults,
  resolveIngestSettings,
  toProjectSettingsPayload,
} from "@/modules/story_intake/domain/ingest-settings";
import {
  isActiveIngestionTask,
  type IngestFileStatus,
  type InputMode,
  type UploadedFileSource,
} from "@/modules/story_intake/domain/ingestion";
import type {
  FormatCheck,
  UploadResult,
} from "@/modules/story_intake/domain/types";
const settingsSchema = z.object({
  spine_template: z.enum(["drama", "narrated"]).optional(),
  visual_style: z.string().optional(),
  narration_style: z.string().optional(),
  ethnicity: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export function createUseStoryIntakeController(
  queries: StoryIntakeQueryHooks,
  previewPreference: ImportPreviewPreference,
) {
  return function useStoryIntakeController(project: string) {
    const {
      useChapters,
      useKnowledgeGraph,
      useStartIngest,
      useUploadNovel,
    } = queries;
    const readHiddenImportedPreview = previewPreference.read;
    const writeHiddenImportedPreview = previewPreference.write;
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    // Upload state
    const [uploadedFile, setUploadedFile] = useState<UploadResult | null>(null);
    const [uploadedFileSource, setUploadedFileSource] =
      useState<UploadedFileSource | null>(null);
    const [inputMode, setInputMode] = useState<InputMode>("upload");
    const [novelFormatOpen, setNovelFormatOpen] = useState(false);
    const [pastedText, setPastedText] = useState("");
    const [ingestSubmitted, setIngestSubmitted] = useState(false);
    const [hideImportedPreview, setHideImportedPreview] = useState(() =>
      readHiddenImportedPreview(project),
    );
    const [ingestFileStatus, setIngestFileStatus] =
      useState<IngestFileStatus>("uploaded");
    const [ingestError, setIngestError] = useState<string | null>(null);
    const [ingestLogs, setIngestLogs] = useState<string[]>([]);
    const [resultView, setResultView] = useState<"chapters" | "graph">("chapters");
    const [formatCheckDetails, setFormatCheckDetails] = useState<{
      formatCheck: FormatCheck;
      filename: string;
    } | null>(null);
    const logsScrollRef = useRef<HTMLDivElement>(null);

    const uploadMutation = useUploadNovel(project);
    const startIngestMutation = useStartIngest(project);
    useEffect(() => {
      setHideImportedPreview(readHiddenImportedPreview(project));
      setResultView("chapters");
    }, [project]);

    // Chapters are the durable project-level fact we can restore from after
    // route changes. Upload filename/size is only local session metadata.
    const { data: chaptersRes, isFetching: chaptersFetching } = useChapters(
      project,
      true,
    );
    const chaptersData = chaptersRes;
    const hasImportedContent = (chaptersData?.chapters?.length ?? 0) > 0;
    const isUploadOnlyPreview = Boolean(chaptersData?.preview_only);

    // SSE task streaming
    const [ingestStarted, setIngestStarted] = useState(false);
    const [reimporting, setReimporting] = useState(false);
    const [reuploadConfirmOpen, setReuploadConfirmOpen] = useState(false);
    const canViewKnowledgeGraph =
      hasImportedContent && !isUploadOnlyPreview && !ingestStarted;
    const knowledgeGraph = useKnowledgeGraph(
      project,
      canViewKnowledgeGraph && resultView === "graph",
    );
    const cancelTask = useCancelTask();
    const taskStream = useTaskStream({
      taskType: "ingest_fast",
      project,
      episode: 0,
      enabled: ingestStarted,
      invalidateKeys: [queryKeys.chapters(project)],
      onComplete: async () => {
        // 显式补一条收尾日志：SSE 的最终「完成」行会被 ingestStarted 门控 + 标量
        // currentTask 覆盖的竞态吞掉（见下方日志收集 effect），导致面板定格在
        // 「Step 3/3…」像卡住。这里不依赖那条会丢的 SSE 行，主动收尾。 (#72)
        setIngestLogs((prev) => {
          const done = t("ingest.logCompleted");
          return prev[prev.length - 1] === done ? prev : [...prev, done];
        });
        setIngestStarted(false);
        setIngestFileStatus("completed");
        setIngestError(null);
        await queryClient.refetchQueries({
          queryKey: queryKeys.chapters(project),
          type: "active",
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.knowledgeGraph(project),
        });
        toast.success(t("common.generate") + " ✓");
      },
      onError: (error) => {
        setIngestStarted(false);
        setIngestFileStatus("failed");
        setIngestError(error);
      },
    });

    useEffect(() => {
      if (!canViewKnowledgeGraph && resultView === "graph") {
        setResultView("chapters");
      }
    }, [canViewKnowledgeGraph, resultView]);

    // Mount reconcile：导入实际在服务端(celery)跑。用户导入中切走再回来，本地
    // 的 ingestStarted/ingestSubmitted 全部重置、SSE 也不重连，而此时章节尚未
    // 持久化(chapters 为空)，页面便退回空上传页——「导入中的素材导入不见了」。
    // 挂载时与服务端任务列表对账一次：若 ingest_fast 仍活跃，就重开进度视图，
    // 让 useTaskStream 重连(后端会在连接时补发运行进度)。
    //
    // 两个坑：
    //  1. tasks(project) 缓存是全局共享的(不含 episode、staleTime=0)，挂载时
    //     React Query 会先同步吐旧缓存(可能是导入前的空列表)再后台 refetch。
    //     必须用 isFetchedAfterMount 只认「本次挂载后刷到的新数据」，否则会拿旧
    //     空列表对账一次就把 ref 锁死，等真数据回来时已早退，恢复被永久错过。
    //  2. 按 project 记账(而非布尔 ref)，这样跨项目复用组件时切到新项目会重新
    //     对账，不会被上一个项目的「已对账」状态卡住。
    //
    // 对账两个方向都要落地：活跃项目开进度视图；切到「无活跃 ingest_fast」的项目
    // 则清掉可能从上一个项目残留的进度视图状态(ingestSubmitted/ingestStarted/
    // ingestFileStatus)，否则组件被跨项目复用时会错显「Importing」卡片并让
    // useTaskStream 去连一个不存在的 SSE。正常路由下父级会按 project remount 兜底，
    // 单次挂载时 else 分支是无副作用的幂等重置(状态本就是初值)——纯防御。
    const { data: ingestTasksRes, isFetchedAfterMount: ingestTasksFetchedAfterMount } =
      useTasks({ project, episode: 0 });
    const ingestReconciledProjectRef = useRef<string | null>(null);
    useEffect(() => {
      if (ingestReconciledProjectRef.current === project) return;
      if (!ingestTasksFetchedAfterMount) return;
      if (ingestTasksRes === undefined) return;
      ingestReconciledProjectRef.current = project;
      const running = (ingestTasksRes.data ?? []).some(
        (task) => isActiveIngestionTask(task.task_type, task.status),
      );
      if (running) {
        setIngestSubmitted(true);
        setIngestStarted(true);
        setIngestFileStatus("importing");
        setHideImportedPreview(false);
      } else {
        setIngestSubmitted(false);
        setIngestStarted(false);
        setIngestFileStatus("uploaded");
      }
    }, [ingestTasksRes, ingestTasksFetchedAfterMount, project]);

    const handleCancelIngest = useCallback(async () => {
      setIngestStarted(false);
      setIngestFileStatus("stopped");
      try {
        await cancelTask.mutateAsync({
          type: "ingest_fast",
          project,
          episode: 0,
        });
        toast.success(t("ingest.stopped"));
      } catch {
        // Already hidden locally; swallow.
      }
    }, [cancelTask, project, t]);

    // Collect ingest logs from SSE currentTask
    useEffect(() => {
      if (taskStream.currentTask && ingestStarted) {
        setIngestLogs((prev) => {
          if (prev[prev.length - 1] === taskStream.currentTask) return prev;
          return [...prev, taskStream.currentTask];
        });
      }
    }, [taskStream.currentTask, ingestStarted]);

    useEffect(() => {
      const root = logsScrollRef.current;
      if (!root) return;
      const viewport = root.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]',
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }, [ingestLogs]);

    // Project config & form
    const { data: projectRes } = useProject(project);
    const { data: stylesRes } = useStyles();
    const updateProject = useUpdateProject(project);
    const config = projectRes;
    const normalizedDefaults = normalizeLegacyDefaults(config);
    const visualStyleOptions = useMemo(() => {
      const styles = stylesRes?.data ?? [];
      if (styles.length > 0) {
        return styles.map((style) => ({
          value: style.id,
          label: style.label || style.name || style.id,
        }));
      }
      return VISUAL_STYLE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      }));
    }, [stylesRes?.data, t]);

    const { watch, setValue, getValues } = useForm<SettingsForm>({
      resolver: zodResolver(settingsSchema),
      values: normalizedDefaults,
    });

    const formValues = watch();
    const settingsValues = resolveIngestSettings(formValues, normalizedDefaults);
    const settingsChanged =
      projectRes !== undefined &&
      hasIngestSettingsChanges(settingsValues, config);
    const spineTemplateLabel =
      SPINE_TEMPLATE_OPTIONS.find((opt) => opt.value === settingsValues.spine_template)
        ?.labelKey ?? "ingest.projectTypes.drama";
    const spineTemplateLocked = ingestStarted || (hasImportedContent && !reimporting);
    // 解说风格（第一/第三人称）只对解说剧（narrated）有意义；精品剧（drama）不存在
    // 解说主角/旁白的人称概念，切到精品剧时隐藏入口并在保存时不落库该字段。
    const showNarrationStyle = settingsValues.spine_template === "narrated";

    const handleFieldChange = useCallback(
      (field: keyof SettingsForm, value: string | undefined) => {
        setValue(field, value, { shouldDirty: true });
      },
      [setValue],
    );

    // Surface a non-blocking format warning as a toast with a "view details"
    // affordance. warning never blocks — upload already succeeded. Only used by
    // the paste flow: the upload flow shows a persistent banner inside
    // SelectedFileCard instead, so the warning stays visible after the toast
    // would have expired.
    const warnFormatCheck = useCallback(
      (formatCheck: FormatCheck | undefined, filename: string) => {
        if (!formatCheck || formatCheck.level !== "warning") return;
        toast.warning(formatCheck.summary || t("aiAssistant.formatCheck.title"), {
          duration: 10000,
          action: {
            label: t("aiAssistant.formatCheck.viewDetails"),
            onClick: () => setFormatCheckDetails({ formatCheck, filename }),
          },
        });
      },
      [t],
    );

    // Handlers
    const handleFile = useCallback(
      async (file: File) => {
        try {
          const result = await uploadMutation.mutateAsync(file);
          setUploadedFile(result);
          setUploadedFileSource("upload");
          setIngestFileStatus("uploaded");
          setIngestError(null);
          toast.success(`${t("common.upload")} ✓ — ${result.filename}`);
          // 格式风险不再走 toast：SelectedFileCard 内有常驻警告条,文件在则警告在。
        } catch (error) {
          toast.error(backendErrorToastMessage(error, t));
        }
      },
      [uploadMutation, t],
    );

    const handleReupload = useCallback(() => {
      setUploadedFile(null);
      setUploadedFileSource(null);
      setIngestSubmitted(false);
      setReimporting(true);
      // Transient-only: keep the upload form for the current view, but do NOT
      // persist the "hide preview" intent. If the user navigates away without
      // completing a new import, returning should restore the imported summary.
      setHideImportedPreview(true);
      setIngestFileStatus("uploaded");
      setIngestError(null);
      setIngestLogs([]);
    }, []);

    const handleDeleteFile = useCallback(() => {
      setUploadedFile(null);
      setUploadedFileSource(null);
      setIngestSubmitted(false);
      // 不要复位 reimporting：若用户正在「重新导入」已导入内容（此时 reimporting=true
      // 才让精品剧/解说剧类型可改），删掉刚选的文件只是想换一个文件、仍处于重新导入流程。
      // 复位成 false 会让 spineTemplateLocked 重新把类型选择器锁死，而提示却让人「重新导入」。
      setHideImportedPreview(true);
      writeHiddenImportedPreview(project, true);
      setIngestFileStatus("uploaded");
      setIngestError(null);
      setIngestLogs([]);
      // 上传接口（useUploadNovel.onSuccess）会把「预览章节」直接写进 chapters 缓存，使
      // hasImportedContent 变 true、进而锁住类型选择器。但这只是预览、并未真正导入；删文件后
      // 必须让缓存与后端重新同步，否则全新项目里删完文件类型仍被锁死（要刷新才解锁）。重拉后：
      // 全新项目 → 后端返回空 → 解锁；已真正导入的项目 → 后端仍有章节 → 维持原状（由 reimporting 决定是否可改）。
      queryClient.invalidateQueries({ queryKey: queryKeys.chapters(project) });
      toast.success(t("ingest.fileDeleted"));
    }, [project, queryClient, t]);

    const uploadPastedText = useCallback(async () => {
      const text = pastedText.trim();
      if (!text) return null;
      const file = new File([text], "pasted-novel.txt", {
        type: "text/plain;charset=utf-8",
      });
      const result = await uploadMutation.mutateAsync(file);
      setUploadedFile(result);
      setUploadedFileSource("paste");
      setIngestFileStatus("uploaded");
      setIngestError(null);
      warnFormatCheck(result.format_check, result.filename);
      return result;
    }, [pastedText, uploadMutation, warnFormatCheck]);

    const saveProjectSettings = useCallback(async () => {
      const defaults = normalizeLegacyDefaults(config);
      const currentSettings = resolveIngestSettings(
        getValues(),
        defaults,
      );
      const payload = toProjectSettingsPayload(currentSettings);
      // 精品剧（非 narrated）没有解说人称概念，绝不落库 narration_style，
      // 避免给后续流程（如人物声线的「第一人称解说声线」判断）留下误导性的脏值。
      if (currentSettings.spine_template !== "narrated") {
        delete payload.narration_style;
      }
      if (hasImportedContent && reimporting) {
        delete payload.spine_template;
      }
      const hasPayloadChanges = INGEST_SETTING_FIELDS.some((field) => {
        if (!(field in payload)) return false;
        return payload[field] !== defaults[field];
      });
      if (!hasPayloadChanges) return false;
      await updateProject.mutateAsync(payload);
      return true;
    }, [config, getValues, hasImportedContent, reimporting, updateProject]);

    const handleSaveSettings = useCallback(async () => {
      try {
        const saved = await saveProjectSettings();
        if (saved) {
          toast.success(t("ingest.settingsSaved"));
        }
      } catch {
        toast.error(t("ingest.settingsSaveFailed"));
      }
    }, [saveProjectSettings, t]);

    // Save-on-import: persist settings (if changed), then kick off ingest
    const handleStartIngest = useCallback(async () => {
      try {
        const sourceFile =
          inputMode === "upload" ? uploadedFile : await uploadPastedText();
        if (!sourceFile) return;
        await saveProjectSettings();
        setIngestLogs([]);
        setIngestError(null);
        await startIngestMutation.mutateAsync({
          filename: sourceFile.filename,
          rebuild: true,
          spine_template: resolveIngestSettings(getValues(), normalizeLegacyDefaults(config))
            .spine_template,
        });
        setIngestSubmitted(true);
        setHideImportedPreview(false);
        writeHiddenImportedPreview(project, false);
        setIngestStarted(true);
        setReimporting(false);
        setIngestFileStatus("importing");
      } catch (error) {
        setIngestFileStatus("failed");
        const message = backendErrorToastMessage(error, t);
        setIngestError(message);
        toast.error(message);
      }
    }, [
      uploadedFile,
      inputMode,
      uploadPastedText,
      saveProjectSettings,
      startIngestMutation,
      getValues,
      config,
      project,
      t,
    ]);

    const chapters = chaptersData?.chapters ?? [];
    const chapterCount = chapters.length;
    const shouldRestoreImportedPreview =
      hasImportedContent && !hideImportedPreview;
    const shouldShowPreview = ingestSubmitted || shouldRestoreImportedPreview;
    const previewFile =
      uploadedFile ??
      (shouldRestoreImportedPreview || ingestSubmitted
        ? { filename: t("ingest.restoredFilename"), size: null }
        : null);
    const previewStatus: IngestFileStatus =
      uploadedFile || ingestSubmitted ? ingestFileStatus : "completed";
    const totalChars =
      typeof chaptersData?.total_chars === "number"
        ? chaptersData.total_chars
        : chapters.reduce(
            (sum, ch) =>
              sum + (ch.word_count ?? ch.char_count ?? ch.content?.length ?? 0),
            0,
          );
    const textChars =
      typeof uploadedFile?.text_chars === "number"
        ? uploadedFile.text_chars
        : typeof chaptersData?.text_chars === "number"
          ? chaptersData.text_chars
          : totalChars;
    const totalCharsUnknown = totalChars === 0 && !chaptersData?.total_chars;
    const isStarting = updateProject.isPending || startIngestMutation.isPending;

    // Fallback title for chapters with no title
    const chapterTitle = useCallback(
      (number: number, title?: string | null, content?: string) => {
        const firstLine = content?.split(/\r?\n/)[0]?.trim();
        return (
          title || firstLine || t("ingest.chapterTitleFallback", { n: number })
        );
      },
      [t],
    );

    const canStartFromCurrentInput =
      inputMode === "upload" ? !!uploadedFile : pastedText.trim().length > 0;
    const hasPastedText = pastedText.trim().length > 0;
    const hasUserUploadedFile = uploadedFileSource === "upload" && !!uploadedFile;
    const sourceHint =
      inputMode === "upload" && hasUserUploadedFile && hasPastedText
        ? t("ingest.sourceHint.uploadActive")
        : inputMode === "paste" && hasUserUploadedFile && hasPastedText
          ? t("ingest.sourceHint.pasteActive")
          : "";

    return {
      uploadedFile,
      inputMode,
      setInputMode,
      novelFormatOpen,
      setNovelFormatOpen,
      pastedText,
      setPastedText,
      ingestSubmitted,
      ingestFileStatus,
      ingestError,
      ingestLogs,
      resultView,
      setResultView,
      formatCheckDetails,
      setFormatCheckDetails,
      logsScrollRef,
      uploadMutation,
      startIngestMutation,
      chaptersData,
      chaptersFetching,
      ingestStarted,
      reuploadConfirmOpen,
      setReuploadConfirmOpen,
      canViewKnowledgeGraph,
      knowledgeGraph,
      cancelTask,
      taskStream,
      visualStyleOptions,
      settingsValues,
      settingsChanged,
      spineTemplateLabel,
      spineTemplateLocked,
      showNarrationStyle,
      updateProject,
      handleFieldChange,
      handleFile,
      handleReupload,
      handleDeleteFile,
      handleSaveSettings,
      handleStartIngest,
      handleCancelIngest,
      chapters,
      chapterCount,
      shouldShowPreview,
      previewFile,
      previewStatus,
      totalChars,
      textChars,
      totalCharsUnknown,
      isStarting,
      chapterTitle,
      canStartFromCurrentInput,
      sourceHint,
    };
  };
}

export type UseStoryIntakeController = ReturnType<
  typeof createUseStoryIntakeController
>;
export type StoryIntakeController = ReturnType<UseStoryIntakeController>;
