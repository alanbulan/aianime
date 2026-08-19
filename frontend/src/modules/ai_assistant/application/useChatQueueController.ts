// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";

import type { ChatAttachment } from "@/modules/ai_assistant/domain/contracts";

type QueuedSendItem = {
  id: string;
  text: string;
  attachments: ChatAttachment[];
  createdAt: number;
};

type SendQueuedMessage = (
  text: string,
  attachments: ChatAttachment[],
) => Promise<boolean>;

type UseChatQueueControllerOptions = {
  busy: boolean;
  connected: boolean;
  preparingSend: boolean;
  project?: string;
  sendMessage: SendQueuedMessage;
};

export function useChatQueueController({
  busy,
  connected,
  preparingSend,
  project,
  sendMessage,
}: UseChatQueueControllerOptions) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedSendItem[]>([]);
  const [selectedQueuedMessageId, setSelectedQueuedMessageId] = useState<string | null>(null);

  useEffect(() => {
    setQueuedMessages([]);
    setSelectedQueuedMessageId(null);
  }, [project]);

  useEffect(() => {
    if (busy || !connected || preparingSend || queuedMessages.length === 0) return;
    const selectedIndex = selectedQueuedMessageId
      ? queuedMessages.findIndex((message) => message.id === selectedQueuedMessageId)
      : -1;
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextMessage = queuedMessages[nextIndex];
    void sendMessage(nextMessage.text, nextMessage.attachments).then((sent) => {
      if (!sent) return;
      // Drop the sent item from whatever the queue holds *now*. Replacing the
      // queue with a snapshot captured before the await would resurrect any
      // message the user deleted while the send was in flight.
      setQueuedMessages((current) =>
        current.filter((message) => message.id !== nextMessage.id),
      );
      // Clearing only our own selection leaves a deliberate pick by the user
      // intact; the next drain falls back to the head of the queue anyway.
      setSelectedQueuedMessageId((current) =>
        current === nextMessage.id ? null : current,
      );
    });
  }, [
    busy,
    connected,
    preparingSend,
    queuedMessages,
    selectedQueuedMessageId,
    sendMessage,
  ]);

  useEffect(() => {
    if (queuedMessages.length === 0) {
      if (selectedQueuedMessageId) setSelectedQueuedMessageId(null);
      return;
    }
    if (
      selectedQueuedMessageId
      && queuedMessages.some((message) => message.id === selectedQueuedMessageId)
    ) {
      return;
    }
    setSelectedQueuedMessageId(queuedMessages[0].id);
  }, [queuedMessages, selectedQueuedMessageId]);

  const enqueueMessage = useCallback((
    text: string,
    attachments: ChatAttachment[],
  ) => {
    setQueuedMessages((current) => [
      ...current,
      {
        id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        attachments,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  const removeQueuedMessage = useCallback((messageId: string) => {
    setQueuedMessages((current) =>
      current.filter((message) => message.id !== messageId),
    );
  }, []);

  const selectQueuedMessage = useCallback((messageId: string) => {
    setSelectedQueuedMessageId(messageId);
  }, []);

  const selectQueuedMessageByOffset = useCallback((offset: number) => {
    if (queuedMessages.length === 0) return;
    setSelectedQueuedMessageId((current) => {
      const currentIndex = current
        ? queuedMessages.findIndex((message) => message.id === current)
        : -1;
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        (baseIndex + offset + queuedMessages.length) % queuedMessages.length;
      return queuedMessages[nextIndex].id;
    });
  }, [queuedMessages]);

  return {
    enqueueMessage,
    queuedMessages,
    removeQueuedMessage,
    selectQueuedMessage,
    selectQueuedMessageByOffset,
    selectedQueuedMessageId,
  };
}
