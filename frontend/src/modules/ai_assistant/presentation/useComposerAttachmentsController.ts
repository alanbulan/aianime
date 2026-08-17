// Copyright (c) 2026 AI anime
import { useCallback, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";

import {
  isAllowedChatDragItem,
  isAllowedChatUpload,
} from "@/modules/ai_assistant/domain/ingestAutomation";
import type { ChatAttachment } from "@/modules/ai_assistant/domain/contracts";

type DragFileState = "valid" | "invalid" | null;

function eventHasFiles(event: ReactDragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function resolveDragFileState(
  event: ReactDragEvent<HTMLElement>,
): Exclude<DragFileState, null> {
  const items = Array.from(event.dataTransfer.items).filter(
    (item) => item.kind === "file",
  );
  if (items.length === 0) return "valid";
  return items.every((item) => {
    const file = item.getAsFile();
    if (file) return isAllowedChatDragItem(file);
    return isAllowedChatDragItem({ type: item.type });
  })
    ? "valid"
    : "invalid";
}

export function useComposerAttachmentsController(enabled: boolean) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [dragFileState, setDragFileState] = useState<DragFileState>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const addFiles = useCallback((files: FileList | readonly File[] | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!isAllowedChatUpload(file)) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = String(reader.result || "");
        setAttachments((current) => [
          ...current,
          {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: file.type.startsWith("image/") ? "image" : "file",
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
            fileSize: file.size,
            content: dataUrl,
          },
        ]);
      });
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const removeAttachment = useCallback((attachmentId: string | undefined) => {
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    );
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleComposerDragEnter = useCallback((
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    if (!enabled || !eventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragFileState(resolveDragFileState(event));
  }, [enabled]);

  const handleComposerDragOver = useCallback((
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    if (!enabled || !eventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextState = resolveDragFileState(event);
    setDragFileState(nextState);
    event.dataTransfer.dropEffect = nextState === "valid" ? "copy" : "none";
  }, [enabled]);

  const handleComposerDragLeave = useCallback((
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    if (!enabled || !eventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragFileState(null);
  }, [enabled]);

  const handleComposerDrop = useCallback((
    event: ReactDragEvent<HTMLDivElement>,
  ): boolean => {
    if (!enabled || !eventHasFiles(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragFileState(null);
    addFiles(event.dataTransfer.files);
    return true;
  }, [addFiles, enabled]);

  return {
    addFiles,
    attachments,
    clearAttachments,
    dragFileState,
    fileInputRef,
    handleComposerDragEnter,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    openFilePicker,
    removeAttachment,
  };
}
