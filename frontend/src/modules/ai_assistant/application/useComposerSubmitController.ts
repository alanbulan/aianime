// Copyright (c) 2026 AI anime
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { toast } from "sonner";

import type { ChatAttachment } from "@/modules/ai_assistant/domain/contracts";

type EnqueueMessage = (
  text: string,
  attachments: ChatAttachment[],
) => void;

type SendMessage = (
  text: string,
  attachments: ChatAttachment[],
) => Promise<boolean>;

type UseComposerSubmitControllerOptions = {
  attachments: ChatAttachment[];
  busy: boolean;
  clearAttachments: () => void;
  connected: boolean;
  draft: string;
  enqueueMessage: EnqueueMessage;
  onDraftChange: (draft: string) => void;
  preparingSend: boolean;
  resetHistorySelection: () => void;
  sendMessage: SendMessage;
  t: TFunction;
};

export function useComposerSubmitController({
  attachments,
  busy,
  clearAttachments,
  connected,
  draft,
  enqueueMessage,
  onDraftChange,
  preparingSend,
  resetHistorySelection,
  sendMessage,
  t,
}: UseComposerSubmitControllerOptions) {
  return useCallback(() => {
    const hasCurrentContent = draft.trim().length > 0 || attachments.length > 0;
    if (!hasCurrentContent || preparingSend) return;
    if (!connected) {
      toast.error(t("aiAssistant.waiting"));
      return;
    }

    resetHistorySelection();
    const text = draft.trim() || t("aiAssistant.attachmentOnlyPrompt");
    const queuedAttachments = attachments.map((attachment) => ({ ...attachment }));
    if (busy) {
      enqueueMessage(text, queuedAttachments);
      onDraftChange("");
      clearAttachments();
      return;
    }

    void sendMessage(text, queuedAttachments).then((sent) => {
      if (!sent) return;
      onDraftChange("");
      clearAttachments();
    });
  }, [
    attachments,
    busy,
    clearAttachments,
    connected,
    draft,
    enqueueMessage,
    onDraftChange,
    preparingSend,
    resetHistorySelection,
    sendMessage,
    t,
  ]);
}
