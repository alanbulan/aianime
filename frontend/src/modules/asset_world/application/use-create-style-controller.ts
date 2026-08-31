// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { StyleQueryHooks } from "@/modules/asset_world/application/style-query-hooks";
import {
  TASK_TYPES,
  useTaskController,
} from "@/modules/task_execution/public";
import {
  buildStyleSavePayload,
  extractEditableStyleConfig,
  isSupportedStylePreviewMimeType,
  type EditableStyleConfig,
  type Style,
} from "@/modules/asset_world/domain/style";

export interface CreateStyleControllerOptions {
  onCreated(styleId: string): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
}

export function createUseCreateStyleController(
  queries: StyleQueryHooks,
) {
  return function useCreateStyleController(
    options: CreateStyleControllerOptions,
  ) {
    const { onCreated, onOpenChange, open, project } = options;
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const createStyle = queries.useCreateStyle();
    const analyzeStyle = queries.useAnalyzeStyle(project);
    const uploadStylePreview = queries.useUploadStylePreview();
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [analyzed, setAnalyzed] = useState<EditableStyleConfig | null>(null);
    const [previewPath, setPreviewPath] = useState<string | null>(null);
    const previewPathRef = useRef<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const previewObjectUrlRef = useRef<string | null>(null);
    const applyAnalyzedConfig = useCallback(
      (result: unknown) => {
        if (!result || typeof result !== "object") {
          toast.error(t("common.error"));
          return;
        }
        const analyzedConfig = result as Record<string, unknown>;
        const label =
          typeof analyzedConfig.label === "string"
            ? analyzedConfig.label
            : typeof analyzedConfig.suggested_label === "string"
              ? analyzedConfig.suggested_label
              : "";
        setAnalyzed(
          extractEditableStyleConfig({
            id: "",
            name: "",
            config: { ...analyzedConfig, label },
          } as Style),
        );
        toast.success(t("styles.paramsExtracted"));
      },
      [t],
    );
    const analysisTask = useTaskController({
      key: {
        taskType: TASK_TYPES.STYLE_ANALYSIS,
        project,
        episode: 0,
      },
      showCompleteToast: false,
      onComplete: applyAnalyzedConfig,
      onError: (error) => toast.error(error),
    });

    useEffect(() => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setPreviewUrl(null);
      if (!open) return;
      setId("");
      setName("");
      setAnalyzed(null);
      setPreviewPath(null);
      previewPathRef.current = null;
    }, [open]);

    useEffect(
      () => () => {
        if (previewObjectUrlRef.current) {
          URL.revokeObjectURL(previewObjectUrlRef.current);
        }
      },
      [],
    );

    const handleAnalyze = async (file: File) => {
      if (!isSupportedStylePreviewMimeType(file.type)) {
        toast.error(t("styles.unsupportedPreviewType"));
        return;
      }
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      previewPathRef.current = null;
      setPreviewPath(null);
      try {
        const uploadResponse = await uploadStylePreview.mutateAsync({
          file,
          styleId: id.trim(),
        });
        if (!uploadResponse.ok) {
          toast.error(uploadResponse.error);
          return;
        }
        const path = uploadResponse.data.preview_path;
        previewPathRef.current = path;
        setPreviewPath(path);
        const analyzeResponse = await analyzeStyle.mutateAsync(file);
        if (!analyzeResponse.ok) {
          toast.error(analyzeResponse.error);
          return;
        }
        analysisTask.start({ scope: analyzeResponse.scope });
        toast.success(analyzeResponse.message);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("common.error"));
      }
    };

    const handleCreate = async () => {
      const trimmedId = id.trim();
      const trimmedName = name.trim();
      if (!trimmedId || !trimmedName) {
        toast.error(t("styles.idNameRequired"));
        return;
      }
      try {
        const result = await createStyle.mutateAsync({
          id: trimmedId,
          name: trimmedName,
          config: analyzed ? buildStyleSavePayload(analyzed, null) : {},
          preview_path: previewPathRef.current ?? previewPath,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(t("styles.styleCreated"));
        onCreated(trimmedId);
        onOpenChange(false);
      } catch {
        toast.error(t("common.error"));
      }
    };

    return {
      analyzed,
      // handleAnalyze uploads first and only then analyzes, so gating on the
      // analyze mutation alone left the trigger live through the whole upload
      // phase — a second click there starts a concurrent upload+analyze pair.
      analyzePending:
        uploadStylePreview.isPending ||
        analyzeStyle.isPending ||
        analysisTask.started,
      createDisabled:
        createStyle.isPending ||
        uploadStylePreview.isPending ||
        analyzeStyle.isPending ||
        analysisTask.started ||
        !id.trim() ||
        !name.trim(),
      createPending: createStyle.isPending,
      fileInputRef,
      handleAnalyze,
      handleCreate,
      id,
      name,
      onOpenChange,
      open,
      previewUrl,
      setId,
      setName,
    };
  };
}

export type CreateStyleController = ReturnType<
  ReturnType<typeof createUseCreateStyleController>
>;
