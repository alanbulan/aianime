// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type UseComposerHistoryNavigationOptions = {
  draft: string;
  history: string[];
  onDraftChange: (draft: string) => void;
  project?: string;
};

export function useComposerHistoryNavigation({
  draft,
  history,
  onDraftChange,
  project,
}: UseComposerHistoryNavigationOptions) {
  const [selectedHistoryMessageIndex, setSelectedHistoryMessageIndex] = useState<number | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreDraftFocusRef = useRef(false);

  useEffect(() => {
    setSelectedHistoryMessageIndex(null);
  }, [project]);

  useLayoutEffect(() => {
    if (!restoreDraftFocusRef.current) return;
    restoreDraftFocusRef.current = false;
    const textarea = draftInputRef.current;
    if (!textarea || textarea.disabled) return;
    if (document.activeElement === textarea) return;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [draft]);

  const resetHistorySelection = useCallback(() => {
    setSelectedHistoryMessageIndex(null);
  }, []);

  const selectHistoryMessage = useCallback((direction: "older" | "newer") => {
    if (history.length === 0) return false;
    if (direction === "older") {
      const nextIndex =
        selectedHistoryMessageIndex === null
          ? history.length - 1
          : Math.max(0, selectedHistoryMessageIndex - 1);
      setSelectedHistoryMessageIndex(nextIndex);
      onDraftChange(history[nextIndex]);
      restoreDraftFocusRef.current = true;
      return true;
    }
    if (selectedHistoryMessageIndex === null) return false;
    if (selectedHistoryMessageIndex >= history.length - 1) {
      setSelectedHistoryMessageIndex(null);
      onDraftChange("");
      restoreDraftFocusRef.current = true;
      return true;
    }
    const nextIndex = selectedHistoryMessageIndex + 1;
    setSelectedHistoryMessageIndex(nextIndex);
    onDraftChange(history[nextIndex]);
    restoreDraftFocusRef.current = true;
    return true;
  }, [history, onDraftChange, selectedHistoryMessageIndex]);

  return {
    draftInputRef,
    resetHistorySelection,
    selectHistoryMessage,
    selectedHistoryMessageIndex,
  };
}
