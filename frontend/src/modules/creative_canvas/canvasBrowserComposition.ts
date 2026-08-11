// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createBlankFreezoneCanvas,
  deleteFreezoneCanvas,
  useFreezoneCanvases,
} from "./canvasStorageComposition";
import { writeUrl } from "@/lib/url-params";
import { useAuthStore } from "@/modules/identity_access/public";
import { ApiError, BackendStatusError } from "@/shared/api/errors";

import {
  personalCanvasIdForUsername,
} from "./domain/canvasIdentity";
import {
  buildCanvasBrowserSections,
  canDeleteCanvasSummary,
  findDuplicateCanvasName,
  userCreatedCanvasId,
  type CanvasDisplaySummary,
} from "./presentation/canvasBrowserViewModel";

export interface CanvasBrowserControllerOptions {
  project: string;
  currentCanvasId: string;
  onRestoreMainlineDefault?: () => Promise<void> | void;
  reloadToken?: number;
}

export function useCanvasBrowserController({
  project,
  currentCanvasId,
  onRestoreMainlineDefault,
  reloadToken,
}: CanvasBrowserControllerOptions) {
  const { t } = useTranslation();
  const username = useAuthStore((state) => state.username);
  const canvasesQuery = useFreezoneCanvases(project);
  const [deletedCanvasIds, setDeletedCanvasIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [deletingCanvasId, setDeletingCanvasId] = useState<string | null>(null);
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [newCanvasName, setNewCanvasNameState] = useState("");
  const [restoringMainline, setRestoringMainline] = useState(false);
  const reloadKey = `${reloadToken ?? 0}`;
  const previousReloadKeyRef = useRef(reloadKey);

  useEffect(() => {
    if (previousReloadKeyRef.current === reloadKey) return;
    previousReloadKeyRef.current = reloadKey;
    void canvasesQuery.refetch();
  }, [canvasesQuery, reloadKey]);

  const items = useMemo(
    () =>
      (canvasesQuery.data ?? []).filter(
        (item) => !deletedCanvasIds.has(item.id),
      ),
    [canvasesQuery.data, deletedCanvasIds],
  );
  const sections = useMemo(
    () => buildCanvasBrowserSections(items, currentCanvasId, username),
    [currentCanvasId, items, username],
  );
  const queryError = canvasesQuery.error;
  const error =
    localError ??
    (queryError instanceof Error
      ? queryError.message
      : queryError
        ? String(queryError)
        : null);

  const setNewCanvasName = (value: string) => {
    setNewCanvasNameState(value);
    if (localError) setLocalError(null);
  };

  const switchTo = (id: string) => {
    if (id === currentCanvasId) return;
    writeUrl({ canvas: id });
  };

  const restoreMainline = async () => {
    if (!onRestoreMainlineDefault) return;
    setRestoringMainline(true);
    try {
      await onRestoreMainlineDefault();
    } finally {
      setRestoringMainline(false);
    }
  };

  const createCanvas = async () => {
    const name = newCanvasName.trim();
    if (!name) {
      setLocalError(t("freezone.canvases.createNameRequired"));
      return;
    }
    const duplicate = findDuplicateCanvasName(items, name, t);
    if (duplicate) {
      setLocalError(t("freezone.canvases.createDuplicate", { name }));
      return;
    }
    const canvasId = userCreatedCanvasId(name, username);
    if (items.some((item) => item.id === canvasId)) {
      setLocalError(t("freezone.canvases.createDuplicate", { name }));
      return;
    }
    setCreatingCanvas(true);
    setLocalError(null);
    try {
      await createBlankFreezoneCanvas(project, {
        canvasId,
        name,
        creatorUsername: username,
      });
      setDeletedCanvasIds((previous) => {
        if (!previous.has(canvasId)) return previous;
        const next = new Set(previous);
        next.delete(canvasId);
        return next;
      });
      setNewCanvasNameState("");
      await canvasesQuery.refetch();
      writeUrl({ canvas: canvasId });
    } catch (caught) {
      if (isConflictError(caught)) {
        setLocalError(t("freezone.canvases.createDuplicate", { name }));
        return;
      }
      const message = caught instanceof Error ? caught.message : String(caught);
      setLocalError(t("freezone.canvases.createFailed", { message }));
    } finally {
      setCreatingCanvas(false);
    }
  };

  const deleteCanvas = async (item: CanvasDisplaySummary) => {
    if (!canDeleteCanvasSummary(item, username)) return;
    setDeletingCanvasId(item.id);
    setLocalError(null);
    try {
      await deleteFreezoneCanvas(project, item.id);
      setDeletedCanvasIds((previous) => new Set(previous).add(item.id));
      await canvasesQuery.refetch();
      if (item.id === currentCanvasId) {
        writeUrl({
          canvas: username ? personalCanvasIdForUsername(username) : "default",
        });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setLocalError(t("freezone.canvases.deleteFailed", { message }));
    } finally {
      setDeletingCanvasId(null);
    }
  };

  return {
    username,
    sections,
    loading: canvasesQuery.isLoading,
    error,
    newCanvasName,
    creatingCanvas,
    deletingCanvasId,
    restoringMainline,
    setNewCanvasName,
    switchTo,
    restoreMainline,
    createCanvas,
    deleteCanvas,
  };
}

function isConflictError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.status === 409) ||
    (error instanceof BackendStatusError && error.status === 409)
  );
}
