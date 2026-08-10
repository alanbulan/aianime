// Copyright (c) 2026 AI anime
import {
  useIngestAutomationControllerWithPorts,
  type IngestAutomationPorts,
  type UseIngestAutomationControllerOptions,
} from "@/modules/ai_assistant/application/useIngestAutomationController";
import {
  useChatSessionController,
  type ChatSessionPorts,
  type UseChatSessionOptions,
} from "@/modules/ai_assistant/application/useChatSessionController";
import {
  clearActiveTurn,
  loadPendingActiveTurn,
  saveActiveTurn,
} from "@/modules/ai_assistant/infrastructure/activeTurnStorage";
import {
  appendChatNotification,
  cancelChatBestEffort,
} from "@/modules/ai_assistant/infrastructure/chatCommands";
import {
  projectHasIngestedContent,
  startNovelIngest,
  uploadNovelForIngest,
} from "@/modules/ai_assistant/infrastructure/ingestAutomationGateway";
import {
  loadUploadedIngestFiles,
  saveUploadedIngestFiles,
} from "@/modules/ai_assistant/infrastructure/ingestUploadStorage";
import {
  loadCachedMessages,
  pruneOldMessageCaches,
  saveCachedMessages,
} from "@/modules/ai_assistant/infrastructure/messageCache";
import {
  loadScopedMessageIds,
  loadSuperChatSettings,
  saveScopedMessageIds,
  saveSuperChatSettings,
} from "@/modules/ai_assistant/infrastructure/preferencesStorage";
import {
  createSuperChatSocketSession,
} from "@/modules/ai_assistant/infrastructure/socketSession";
import {
  transcribeLocalSpeech as transcribeLocalSpeechThroughGateway,
} from "@/modules/ai_assistant/infrastructure/localSpeechTranscriptionGateway";

const chatSessionPorts: ChatSessionPorts = {
  appendChatNotification,
  cancelChatBestEffort,
  clearActiveTurn,
  createSuperChatSocketSession,
  loadCachedMessages,
  loadPendingActiveTurn,
  loadScopedMessageIds,
  loadSuperChatSettings,
  pruneOldMessageCaches,
  saveActiveTurn,
  saveCachedMessages,
  saveScopedMessageIds,
  saveSuperChatSettings,
};

const ingestAutomationPorts: IngestAutomationPorts = {
  loadUploadedIngestFiles,
  projectHasIngestedContent,
  saveUploadedIngestFiles,
  startNovelIngest,
  uploadNovelForIngest,
};

export function useChatSession(options: UseChatSessionOptions) {
  return useChatSessionController({
    ...options,
    ports: chatSessionPorts,
  });
}

export function useIngestAutomationController(
  options: UseIngestAutomationControllerOptions,
) {
  return useIngestAutomationControllerWithPorts({
    ...options,
    ports: ingestAutomationPorts,
  });
}

export const transcribeLocalSpeech = transcribeLocalSpeechThroughGateway;
