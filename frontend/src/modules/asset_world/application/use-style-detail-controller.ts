// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { StyleQueryHooks } from "@/modules/asset_world/application/style-query-hooks";
import {
  buildStyleSavePayload,
  EDITABLE_STYLE_CONFIG_KEYS,
  extractEditableStyleConfig,
  isPresetStyle,
  isSupportedStylePreviewMimeType,
  type EditableStyleConfig,
  type Style,
} from "@/modules/asset_world/domain/style";

interface UpdateProjectMutation {
  isPending: boolean;
  mutateAsync(config: { visual_style: string }): Promise<unknown>;
}

export interface StyleDetailControllerDependencies {
  stylePreviewUrl(styleId: string): string;
  useUpdateProject(project: string): UpdateProjectMutation;
}

export interface StyleDetailControllerOptions {
  isProjectDefault: boolean;
  onClearSelection(): void;
  project: string;
  style: Style;
}

export function createUseStyleDetailController(
  queries: StyleQueryHooks,
  dependencies: StyleDetailControllerDependencies,
) {
  return function useStyleDetailController(
    options: StyleDetailControllerOptions,
  ) {
    const { isProjectDefault, onClearSelection, project, style } = options;
    const { t } = useTranslation();
    const updateStyle = queries.useUpdateStyle();
    const deleteStyle = queries.useDeleteStyle();
    const uploadStylePreview = queries.useUploadStylePreview();
    const updateProject = dependencies.useUpdateProject(project);
    const previewFileInputRef = useRef<HTMLInputElement>(null);
    const preset = isPresetStyle(style);
    const original = useMemo(() => extractEditableStyleConfig(style), [style]);
    const [fields, setFields] = useState<EditableStyleConfig>(original);
    const [editingName, setEditingName] = useState(style.name);
    const [nameEditOpen, setNameEditOpen] = useState(false);
    const [nameEditValue, setNameEditValue] = useState(style.name);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const [jsonText, setJsonText] = useState("");
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [previewRevision, setPreviewRevision] = useState(0);

    useEffect(() => {
      setPreviewRevision(0);
    }, [style.id]);

    useEffect(() => {
      setFields(original);
      setEditingName(style.name);
      setNameEditOpen(false);
      setNameEditValue(style.name);
      setDeleteConfirmOpen(false);
      setShowJson(false);
      setJsonError(null);
      setJsonText(JSON.stringify(buildStyleSavePayload(original, style), null, 2));
    }, [original, style]);

    const dirty = useMemo(() => {
      if (editingName !== style.name) return true;
      if (showJson) {
        return (
          jsonText !==
          JSON.stringify(buildStyleSavePayload(original, style), null, 2)
        );
      }
      return EDITABLE_STYLE_CONFIG_KEYS.some(
        (key) => fields[key] !== original[key],
      );
    }, [editingName, fields, jsonText, original, showJson, style]);

    const updateField = (key: keyof EditableStyleConfig, value: string) =>
      setFields((current) => ({ ...current, [key]: value }));

    const handleSave = async () => {
      let config: Record<string, unknown>;
      if (showJson) {
        try {
          config = JSON.parse(jsonText) as Record<string, unknown>;
        } catch {
          setJsonError(t("styles.jsonFormatError"));
          return;
        }
        setJsonError(null);
      } else {
        config = buildStyleSavePayload(fields, style);
      }

      try {
        await updateStyle.mutateAsync({
          id: style.id,
          name: editingName.trim() || style.name,
          config,
        });
        toast.success(t("styles.styleSaved"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handleApplyToProject = async () => {
      try {
        await updateProject.mutateAsync({ visual_style: style.id });
        toast.success(
          t("styles.setAsDefault", { name: style.label || style.name }),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handleDelete = async () => {
      try {
        await deleteStyle.mutateAsync({ styleId: style.id });
        setDeleteConfirmOpen(false);
        toast.success(t("styles.deleted"));
        onClearSelection();
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handlePreviewUpload = async (file: File) => {
      if (preset) return;
      if (!isSupportedStylePreviewMimeType(file.type)) {
        toast.error(t("styles.unsupportedPreviewType"));
        return;
      }
      try {
        const response = await uploadStylePreview.mutateAsync({
          file,
          styleId: style.id,
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        setPreviewRevision(Date.now());
        toast.success(t("styles.previewUploaded"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const setJsonEditorOpen = (nextOpen: boolean) => {
      if (nextOpen === showJson) return;
      if (nextOpen) {
        setJsonText(JSON.stringify(buildStyleSavePayload(fields, style), null, 2));
        setJsonError(null);
      } else {
        try {
          const changed =
            jsonText !==
            JSON.stringify(buildStyleSavePayload(fields, style), null, 2);
          const parsed = JSON.parse(jsonText) as Record<string, unknown>;
          setFields(
            extractEditableStyleConfig({
              id: style.id,
              name: editingName,
              config: parsed,
            }),
          );
          if (changed) toast.success(t("styles.jsonChangesApplied"));
        } catch {
          // Invalid JSON leaves the structured fields unchanged.
        }
      }
      setShowJson(nextOpen);
    };

    const handleRename = async () => {
      const trimmed = nameEditValue.trim();
      if (!trimmed) return;
      try {
        await updateStyle.mutateAsync({
          id: style.id,
          name: trimmed,
          config: buildStyleSavePayload(fields, style),
        });
        setEditingName(trimmed);
        toast.success(t("styles.styleSaved"));
      } catch {
        toast.error(t("common.error"));
      }
      setNameEditOpen(false);
    };

    return {
      applyPending: updateProject.isPending,
      savePending: updateStyle.isPending,
      deleteConfirmOpen,
      deletePending: deleteStyle.isPending,
      dirty,
      editingName,
      fields,
      handleApplyToProject,
      handleDelete,
      handlePreviewUpload,
      handleRename,
      handleSave,
      isProjectDefault,
      jsonError,
      jsonText,
      nameEditOpen,
      nameEditValue,
      onJsonTextChange: (value: string) => {
        setJsonText(value);
        setJsonError(null);
      },
      openRename: () => {
        setNameEditValue(editingName);
        setNameEditOpen(true);
      },
      preset,
      previewFileInputRef,
      previewUploadPending: uploadStylePreview.isPending,
      previewUrl: (() => {
        const baseUrl = preset
          ? dependencies.stylePreviewUrl(style.id)
          : style.preview_url ||
            (previewRevision ? dependencies.stylePreviewUrl(style.id) : null);
        if (!baseUrl || !previewRevision || preset) return baseUrl;
        const separator = baseUrl.includes("?") ? "&" : "?";
        return `${baseUrl}${separator}uploaded=${previewRevision}`;
      })(),
      setJsonEditorOpen,
      setDeleteConfirmOpen,
      setNameEditOpen,
      setNameEditValue,
      showJson,
      style,
      updateField,
    };
  };
}

export type StyleDetailController = ReturnType<
  ReturnType<typeof createUseStyleDetailController>
>;
