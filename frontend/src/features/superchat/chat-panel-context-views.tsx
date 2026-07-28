// Copyright (c) 2026 AI anime
import { ApprovalCard } from "@/features/superchat/approval-card";
import { SearchBar } from "@/features/superchat/chat-search-bar";
import { PinnedPanel } from "@/features/superchat/pinned-messages-panel";
import type {
  ApprovalRequest,
  ChatMessage,
} from "@/features/superchat/types";

type ApprovalDecision = "allow-once" | "allow-always" | "deny";

type ChatPanelContextViewsProps = {
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
