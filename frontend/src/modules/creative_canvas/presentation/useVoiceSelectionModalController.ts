// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { toast } from 'sonner';

import { loadCanvasAudioReferences, createCanvasAudioVoice } from "../audioVoiceCatalogComposition";
import type { CanvasAudioReference } from "../application/audioVoiceCatalog";
import type { AudioVoiceRef } from "../domain/audioVoice";
import {
  VOICE_CLONE_FILE_ACCEPT,
  customVoiceReferences,
  filterCustomVoiceReferences,
  filterLibraryVoiceReferences,
  paginateVoiceReferences,
  projectCustomVoiceRows,
  projectLibraryVoiceRows,
  resolveVoicePaginationJump,
  sanitizeVoicePaginationInput,
  voiceCloneFileStem,
  voiceCloneFileValidationError,
  voiceCloneUploadError,
  type VoicePickResult,
  type VoiceSelectionTab,
} from "../application/voiceSelectionModel";

export interface VoiceSelectionModalControllerOptions {
  projectId: string;
  open: boolean;
  onClose: () => void;
  currentRef: AudioVoiceRef;
  onPick: (result: VoicePickResult) => void;
}

export function useVoiceSelectionModalController({
  projectId,
  open,
  onClose,
  currentRef,
  onPick,
}: VoiceSelectionModalControllerOptions) {
  const [tab, setTab] = useState<VoiceSelectionTab>('library');
  const [items, setItems] = useState<CanvasAudioReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryPageNumber, setLibraryPageNumber] = useState(1);
  const [libraryJumpValue, setLibraryJumpValue] = useState('');
  const [mineQuery, setMineQuery] = useState('');
  const [minePageNumber, setMinePageNumber] = useState(1);
  const [mineJumpValue, setMineJumpValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await loadCanvasAudioReferences(projectId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载声线失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setLibraryQuery('');
    setLibraryPageNumber(1);
    setLibraryJumpValue('');
    setMineQuery('');
    setMinePageNumber(1);
    setMineJumpValue('');
    void reload();
  }, [open, reload]);

  const libraryPage = useMemo(
    () =>
      paginateVoiceReferences(
        filterLibraryVoiceReferences(items, libraryQuery),
        libraryPageNumber,
      ),
    [items, libraryPageNumber, libraryQuery],
  );
  const minePage = useMemo(
    () =>
      paginateVoiceReferences(
        filterCustomVoiceReferences(customVoiceReferences(items), mineQuery),
        minePageNumber,
      ),
    [items, minePageNumber, mineQuery],
  );
  const libraryRows = useMemo(
    () => projectLibraryVoiceRows(libraryPage.items, currentRef),
    [currentRef, libraryPage.items],
  );
  const mineRows = useMemo(
    () => projectCustomVoiceRows(minePage.items, currentRef),
    [currentRef, minePage.items],
  );

  const handleLibraryQueryChange = useCallback((query: string) => {
    setLibraryQuery(query);
    setLibraryPageNumber(1);
  }, []);

  const handleMineQueryChange = useCallback((query: string) => {
    setMineQuery(query);
    setMinePageNumber(1);
  }, []);

  const handleTabChange = useCallback(
    (nextTab: VoiceSelectionTab) => {
      if (nextTab === tab) return;
      setTab(nextTab);
      if (nextTab === 'library') {
        setLibraryQuery('');
        setLibraryPageNumber(1);
        setLibraryJumpValue('');
        return;
      }
      setMineQuery('');
      setMinePageNumber(1);
      setMineJumpValue('');
    },
    [tab],
  );

  const handleClone = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const validationError = voiceCloneFileValidationError(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      setUploading(true);
      try {
        await createCanvasAudioVoice(
          projectId,
          file,
          voiceCloneFileStem(file.name),
        );
        await reload();
      } catch (uploadError) {
        toast.error(voiceCloneUploadError(uploadError));
      } finally {
        setUploading(false);
      }
    },
    [projectId, reload],
  );

  const updateLibraryJumpValue = useCallback((value: string) => {
    setLibraryJumpValue(sanitizeVoicePaginationInput(value));
  }, []);
  const updateMineJumpValue = useCallback((value: string) => {
    setMineJumpValue(sanitizeVoicePaginationInput(value));
  }, []);

  const commitLibraryJump = useCallback(() => {
    const target = resolveVoicePaginationJump(
      libraryJumpValue,
      libraryPage.totalPages,
    );
    if (target !== null) setLibraryPageNumber(target);
    setLibraryJumpValue('');
  }, [libraryJumpValue, libraryPage.totalPages]);

  const commitMineJump = useCallback(() => {
    const target = resolveVoicePaginationJump(
      mineJumpValue,
      minePage.totalPages,
    );
    if (target !== null) setMinePageNumber(target);
    setMineJumpValue('');
  }, [mineJumpValue, minePage.totalPages]);

  return {
    open,
    onClose,
    onPick,
    tab,
    setTab: handleTabChange,
    loading,
    error,
    libraryQuery,
    handleLibraryQueryChange,
    libraryPage,
    libraryRows,
    setLibraryPageNumber,
    libraryJumpValue,
    updateLibraryJumpValue,
    commitLibraryJump,
    mineQuery,
    handleMineQueryChange,
    minePage,
    mineRows,
    setMinePageNumber,
    mineJumpValue,
    updateMineJumpValue,
    commitMineJump,
    uploading,
    fileInputRef,
    handleClone,
    handleFileChange,
    fileAccept: VOICE_CLONE_FILE_ACCEPT,
  };
}

export type VoiceSelectionModalController = ReturnType<
  typeof useVoiceSelectionModalController
>;
