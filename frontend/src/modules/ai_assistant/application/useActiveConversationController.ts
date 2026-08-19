// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from "react";

export type ActiveConversationPorts = {
  activeConversationScopeKey: (username: string, project?: string) => string;
  loadActiveConversation: (scopeKey: string) => string;
  saveActiveConversation: (scopeKey: string, conversationId: string) => void;
};

export type UseActiveConversationOptions = {
  username: string | null | undefined;
  project?: string;
};

/**
 * Owns the persisted "which conversation is open" selection per account+scope.
 *
 * Wraps the localStorage adapter behind ports so presentation components
 * never import infrastructure directly (presentation → application →
 * infrastructure, wired in composition).
 */
export function useActiveConversationController({
  username,
  project,
  ports,
}: UseActiveConversationOptions & { ports: ActiveConversationPorts }) {
  const { activeConversationScopeKey, loadActiveConversation, saveActiveConversation } =
    ports;
  const conversationScopeKey = activeConversationScopeKey(
    username ?? "",
    project,
  );
  const storedConversationId = useMemo(
    () => loadActiveConversation(conversationScopeKey),
    [conversationScopeKey, loadActiveConversation],
  );
  // Local selections overlay the persisted value so re-selecting in one
  // scope never flashes another scope's stored conversation.
  const [selections, setSelections] = useState<Record<string, string>>({});
  const conversationId =
    selections[conversationScopeKey] ?? storedConversationId;

  const selectConversation = useCallback(
    (nextConversationId: string) => {
      saveActiveConversation(conversationScopeKey, nextConversationId);
      setSelections((current) => ({
        ...current,
        [conversationScopeKey]: nextConversationId,
      }));
    },
    [conversationScopeKey, saveActiveConversation],
  );

  return {
    conversationScopeKey,
    conversationId,
    selectConversation,
  };
}
