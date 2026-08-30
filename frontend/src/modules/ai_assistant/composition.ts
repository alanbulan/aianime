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
  useActiveConversationController as useActiveConversationControllerWithPorts,
  type ActiveConversationPorts,
  type UseActiveConversationOptions,
} from "@/modules/ai_assistant/application/useActiveConversationController";
import {
  activeConversationScopeKey,
  loadActiveConversation,
  saveActiveConversation,
} from "@/modules/ai_assistant/infrastructure/activeConversationStorage";
import {
  clearActiveTurn,
  loadPendingActiveTurn,
  saveActiveTurn,
} from "@/modules/ai_assistant/infrastructure/activeTurnStorage";
import {
  appendChatNotification,
  cancelChatBestEffort,
  resolveChatDecision,
  runChatSlashCommand,
  setChatMessageContextState,
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
import {
  commercialModelRoleRoutes,
  catalogRouteSelector,
  clearCommercialModelCatalogCache,
  loadCommercialModelAccessStatus,
  loadCommercialModelCatalog,
  type CommercialModelAccessStatus,
  type CommercialModelCatalog,
} from "@/modules/model_usage/public";
import type { ModelEntry } from "@/modules/ai_assistant/domain/contracts";

export async function loadChatModels(): Promise<ModelEntry[]> {
  clearCommercialModelCatalogCache();
  const catalog = await loadCommercialModelCatalog("TEXT", "active")
    .catch(() => null);
  const status = await loadCommercialModelAccessStatus();
  return buildChatModelEntries(status, catalog);
}

export function buildChatModelEntries(
  status: CommercialModelAccessStatus,
  catalog: CommercialModelCatalog | null,
): ModelEntry[] {
  const catalogItems = catalog?.items ?? [];
  const catalogByRoute = new Map(
    catalogItems.flatMap((item) => {
      const selector = catalogRouteSelector(item);
      return selector ? [[selector, item] as const] : [];
    }),
  );
  const routes = commercialModelRoleRoutes(status, "TEXT");
  const automaticRoute = routes[0];
  const entryForRoute = (route: (typeof routes)[number]): ModelEntry => {
    const item = catalogByRoute.get(route.selector);
    return {
      id: route.selector,
      label: item?.displayName ?? route.modelId,
      description: "仅固定当前对话；不会修改全局模型优先级",
      modelId: route.modelId,
      providerLabel: route.providerName,
      source: route.source,
      ...(route.contextWindow === undefined
        ? {}
        : { contextWindow: route.contextWindow }),
      ...(route.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: route.maxOutputTokens }),
      ...(route.reasoningEfforts?.length
        ? {
            reasoningEfforts: route.reasoningEfforts,
            ...(route.defaultReasoningEffort
              ? { defaultReasoningEffort: route.defaultReasoningEffort }
              : {}),
          }
        : {}),
    };
  };
  const automaticModel = automaticRoute ? entryForRoute(automaticRoute) : null;
  return [
    {
      id: "auto",
      label: "自动（遵循模型优先级）",
      description: automaticRoute
        ? `当前优先使用 ${automaticRoute.providerName} / ${automaticModel?.label ?? automaticRoute.modelId}，失败时按优先级回退`
        : "按右上角设置中的云端/BYOK 优先级自动选择",
      providerLabel: "全局路由",
      source: "auto",
      ...(automaticModel?.contextWindow === undefined
        ? {}
        : { contextWindow: automaticModel.contextWindow }),
      ...(automaticModel?.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: automaticModel.maxOutputTokens }),
      ...(automaticModel?.reasoningEfforts
        ? {
            reasoningEfforts: automaticModel.reasoningEfforts,
            ...(automaticModel.defaultReasoningEffort
              ? { defaultReasoningEffort: automaticModel.defaultReasoningEffort }
              : {}),
            ...(automaticModel.reasoningEffortDescription
              ? { reasoningEffortDescription: automaticModel.reasoningEffortDescription }
              : {}),
          }
        : {}),
    },
    ...routes.map(entryForRoute),
  ];
}

const chatSessionPorts: ChatSessionPorts = {
  appendChatNotification,
  cancelChatBestEffort,
  clearActiveTurn,
  createSuperChatSocketSession,
  loadCachedMessages,
  loadChatModels,
  loadPendingActiveTurn,
  loadScopedMessageIds,
  loadSuperChatSettings,
  pruneOldMessageCaches,
  resolveChatDecision,
  runChatSlashCommand,
  saveActiveTurn,
  saveCachedMessages,
  saveScopedMessageIds,
  saveSuperChatSettings,
  setChatMessageContextState,
};

const ingestAutomationPorts: IngestAutomationPorts = {
  loadUploadedIngestFiles,
  projectHasIngestedContent,
  saveUploadedIngestFiles,
  startNovelIngest,
  uploadNovelForIngest,
};

const activeConversationPorts: ActiveConversationPorts = {
  activeConversationScopeKey,
  loadActiveConversation,
  saveActiveConversation,
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

export function useActiveConversation(options: UseActiveConversationOptions) {
  return useActiveConversationControllerWithPorts({
    ...options,
    ports: activeConversationPorts,
  });
}

export const transcribeLocalSpeech = transcribeLocalSpeechThroughGateway;
