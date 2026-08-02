// Copyright (c) 2026 AI anime
import type {
  ApprovalRequest,
  ChatMessage,
} from "@/modules/ai_assistant/domain/contracts";
import { ApprovalCard } from "@/modules/ai_assistant/presentation/ApprovalCard";
import { PinnedPanel } from "@/modules/ai_assistant/presentation/PinnedPanel";
import { SearchBar } from "@/modules/ai_assistant/presentation/SearchBar";

type ApprovalDecision = "allow-once" | "allow-always" | "deny";

export type ChatPanelContextViewsProps = {
  approvals: ApprovalRequest[];
  error: string | null;
  pinnedMessages: ChatMessage[];
  searchOpen: boolean;
  searchQuery: string;
  onClearPinned: () => void;
  onResolveApproval: (
    approval: ApprovalRequest,
    decision: ApprovalDecision,
  ) => void;
  onSearchChange: (query: string) => void;
  onSearchClose: () => void;
  onTogglePin: (messageId: string) => void;
};

export function ChatPanelContextViews({
  approvals,
  error,
  pinnedMessages,
  searchOpen,
  searchQuery,
  onClearPinned,
  onResolveApproval,
  onSearchChange,
  onSearchClose,
  onTogglePin,
}: ChatPanelContextViewsProps) {
  return (
    <>
      {error && (
        <div className="border-b border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          onResolve={(decision) => onResolveApproval(approval, decision)}
        />
      ))}

      <PinnedPanel
        messages={pinnedMessages}
        onClear={onClearPinned}
        onTogglePin={onTogglePin}
      />

      {searchOpen && (
        <SearchBar
          query={searchQuery}
          onChange={onSearchChange}
          onClose={onSearchClose}
        />
      )}
    </>
  );
}
