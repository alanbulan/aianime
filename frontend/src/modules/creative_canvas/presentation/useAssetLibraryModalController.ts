// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';

import {
  assetLibraryAcceptsMimeType,
  assetLibrarySelectionKey,
  assetLibraryUploadName,
  countAssetLibrarySelections,
  filterAssetLibraryEntries,
  projectAssetLibrarySelections,
  resolveAssetLibraryActiveTab,
  resolveAssetLibraryTabs,
  toggleAssetLibrarySelection,
  type AssetLibraryTabKey,
} from '../application/assetLibraryModalModel';
import {
  addCanvasAssetLibraryItem,
  deleteCanvasAssetLibraryItem,
  loadCanvasAssetLibrary,
  syncCanvasAssetLibraryFromMainline,
} from '../assetLibraryComposition';
import { uploadFreezoneAsset } from '../assetTransferComposition';
import type {
  CanvasAssetLibraryItem,
  CanvasAssetLibraryMedia,
  CanvasAssetLibrarySelection,
} from '../domain/assetLibrary';

export interface AssetLibraryModalControllerOptions {
  open: boolean;
  project: string | null;
  onClose: () => void;
  onSuccess?: () => void;
  onConfirm?: (selections: CanvasAssetLibrarySelection[]) => void;
  maxSelectable?: number;
  allowedMedia?: CanvasAssetLibraryMedia[];
}

export interface AssetLibraryPendingUpload {
  id: string;
  fileName: string;
  previewUrl: string;
  media: CanvasAssetLibraryMedia;
  status: 'uploading' | 'failed';
  error?: string;
}

function createPendingUploadId(): string {
  return `al_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useAssetLibraryModalController({
  open,
  project,
  onClose,
  onSuccess,
  onConfirm,
  maxSelectable = 9,
  allowedMedia,
}: AssetLibraryModalControllerOptions) {
  const tabs = useMemo(
    () => resolveAssetLibraryTabs(allowedMedia),
    [allowedMedia],
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const [library, setLibrary] = useState<CanvasAssetLibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<
    AssetLibraryPendingUpload[]
  >([]);
  const pendingRef = useRef<AssetLibraryPendingUpload[]>([]);
  pendingRef.current = pendingUploads;
  const [isDragging, setIsDragging] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<AssetLibraryTabKey>(
    tabs[0]?.key ?? 'image',
  );
  const activeTab = useMemo(
    () => resolveAssetLibraryActiveTab(tabs, activeTabKey),
    [activeTabKey, tabs],
  );
  const activeMedia = activeTab?.media ?? 'image';

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTabKey)) {
      setActiveTabKey(tabs[0]?.key ?? 'image');
    }
  }, [activeTabKey, tabs]);

  const refreshLibrary = useCallback(async (): Promise<
    CanvasAssetLibraryItem[]
  > => {
    if (!project) return [];
    try {
      const items = await loadCanvasAssetLibrary(project);
      setLibrary(items);
      return items;
    } catch (error) {
      console.warn('[asset-library] load failed, treat as empty', error);
      setLibrary([]);
      return [];
    }
  }, [project]);

  const initializeLibrary = useCallback(
    async (isCancelled?: () => boolean) => {
      if (!project) return;
      setIsLoadingLibrary(true);
      setLibraryError(null);
      const base = await refreshLibrary();
      if (isCancelled?.()) return;
      setIsSyncing(true);
      try {
        const items = await syncCanvasAssetLibraryFromMainline(project);
        if (isCancelled?.()) return;
        setLibrary(items);
        onSuccessRef.current?.();
      } catch (error) {
        if (isCancelled?.()) return;
        console.warn('[asset-library] auto sync failed', error);
        if (base.length === 0) {
          setLibraryError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (!isCancelled?.()) {
          setIsSyncing(false);
          setIsLoadingLibrary(false);
        }
      }
    },
    [project, refreshLibrary],
  );

  useEffect(() => {
    if (!open || !project) return;
    let cancelled = false;
    void initializeLibrary(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [initializeLibrary, open, project]);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      pendingRef.current.forEach((pending) =>
        URL.revokeObjectURL(pending.previewUrl),
      );
      setPendingUploads([]);
      setLibrary([]);
      setLibraryError(null);
      setDeletingId(null);
      setIsDragging(false);
      setIsSyncing(false);
      setSelectedKeys([]);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(
    () => () => {
      pendingRef.current.forEach((pending) =>
        URL.revokeObjectURL(pending.previewUrl),
      );
    },
    [],
  );

  const handleSyncFromMainline = useCallback(async () => {
    if (!project || isSyncing) return;
    setIsSyncing(true);
    setLibraryError(null);
    try {
      const items = await syncCanvasAssetLibraryFromMainline(project);
      setLibrary(items);
      onSuccess?.();
    } catch (error) {
      console.error('[asset-library] sync failed', error);
      setLibraryError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, onSuccess, project]);

  const removePending = useCallback((id: string) => {
    setPendingUploads((previous) => {
      const target = previous.find((pending) => pending.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((pending) => pending.id !== id);
    });
  }, []);

  const uploadOne = useCallback(
    async (entry: AssetLibraryPendingUpload, file: File) => {
      if (!project) return;
      try {
        const uploaded =
          entry.media === 'image'
            ? await uploadFreezoneAsset(project, file, file.name)
            : await uploadFreezoneAsset(project, file, file.name, {
                disableTimeout: true,
              });
        const cleanUrl = uploaded.url.split('?')[0];
        await addCanvasAssetLibraryItem(project, {
          name: assetLibraryUploadName(file.name),
          media: entry.media,
          url: cleanUrl,
        });
        URL.revokeObjectURL(entry.previewUrl);
        setPendingUploads((previous) =>
          previous.filter((pending) => pending.id !== entry.id),
        );
        await refreshLibrary();
        onSuccess?.();
      } catch (error) {
        console.error('[asset-library] upload failed', error);
        const message = error instanceof Error ? error.message : String(error);
        setPendingUploads((previous) =>
          previous.map((pending) =>
            pending.id === entry.id
              ? { ...pending, status: 'failed', error: message }
              : pending,
          ),
        );
      }
    },
    [onSuccess, project, refreshLibrary],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (!project || !activeTab?.allowUpload) return;
      const accepted: Array<{
        entry: AssetLibraryPendingUpload;
        file: File;
      }> = [];
      Array.from(files).forEach((file) => {
        if (!assetLibraryAcceptsMimeType(file.type, activeMedia)) return;
        accepted.push({
          entry: {
            id: createPendingUploadId(),
            fileName: file.name,
            previewUrl: URL.createObjectURL(file),
            media: activeMedia,
            status: 'uploading',
          },
          file,
        });
      });
      if (accepted.length === 0) return;
      setPendingUploads((previous) => [
        ...previous,
        ...accepted.map(({ entry }) => entry),
      ]);
      accepted.forEach(({ entry, file }) => {
        void uploadOne(entry, file);
      });
    },
    [activeMedia, activeTab, project, uploadOne],
  );

  const handleDeleteEntry = useCallback(
    async (entry: CanvasAssetLibraryItem) => {
      if (!project || !entry.id) return;
      const confirmed = window.confirm(
        `确定要删除「${entry.name || entry.id}」？`,
      );
      if (!confirmed) return;
      setDeletingId(entry.id);
      try {
        await deleteCanvasAssetLibraryItem(project, entry.id);
        await refreshLibrary();
      } catch (error) {
        console.error('[asset-library] delete failed', error);
        setLibraryError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setDeletingId(null);
      }
    },
    [project, refreshLibrary],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer?.files?.length) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const visibleItems = useMemo(
    () => filterAssetLibraryEntries(library, activeTab),
    [activeTab, library],
  );
  const visiblePending = useMemo(
    () =>
      activeTab?.allowUpload
        ? pendingUploads.filter(
            (pending) => pending.media === activeTab.media,
          )
        : [],
    [activeTab, pendingUploads],
  );
  const activeSelectedCount = countAssetLibrarySelections(
    selectedKeys,
    activeMedia,
  );

  const isSelected = useCallback(
    (key: string) => selectedKeys.includes(key),
    [selectedKeys],
  );

  const toggleSelect = useCallback(
    (key: string) => {
      setSelectedKeys((previous) =>
        toggleAssetLibrarySelection(previous, key, maxSelectable),
      );
    },
    [maxSelectable],
  );

  const handleConfirm = useCallback(() => {
    if (selectedKeys.length === 0) {
      onClose();
      return;
    }
    onConfirm?.(projectAssetLibrarySelections(library, selectedKeys));
    onClose();
  }, [library, onClose, onConfirm, selectedKeys]);

  return {
    open,
    project,
    onClose,
    maxSelectable,
    tabs,
    activeTabKey,
    setActiveTabKey,
    activeTab,
    activeMedia,
    fileInputRef,
    isLoadingLibrary,
    libraryError,
    isSyncing,
    deletingId,
    pendingUploads,
    isDragging,
    setIsDragging,
    visibleItems,
    visiblePending,
    totalCount: library.length + pendingUploads.length,
    activeSelectedCount,
    hasSelection: selectedKeys.length > 0,
    handleSyncFromMainline,
    removePending,
    handleFiles,
    handleDeleteEntry,
    handleDrop,
    selectionKey: assetLibrarySelectionKey,
    isSelected,
    toggleSelect,
    handleConfirm,
  };
}

export type AssetLibraryModalController = ReturnType<
  typeof useAssetLibraryModalController
>;
