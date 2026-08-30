// Copyright (c) 2026 AI anime
import type {
  ApprovalRequest,
  ChatMessage,
  DecisionAnswer,
  DecisionRequest,
} from "@/modules/ai_assistant/domain/contracts";
import { ApprovalCard } from "@/modules/ai_assistant/presentation/ApprovalCard";
import { DecisionCard } from "@/modules/ai_assistant/presentation/DecisionCard";
import { PinnedPanel } from "@/modules/ai_assistant/presentation/PinnedPanel";
import { SearchBar } from "@/modules/ai_assistant/presentation/SearchBar";

type ApprovalDecision = "allow-once" | "allow-always" | "deny";

export type ChatPanelContextViewsProps = {
  approvals: ApprovalRequest[];
  decisions: DecisionRequest[];
  submittingDecisionIds: Set<string>;
  error: string | null;
  pinnedMessages: ChatMessage[];
  searchOpen: boolean;
  searchQuery: string;
  onClearPinned: () => void;
  onResolveApproval: (
    approval: ApprovalRequest,
    decision: ApprovalDecision,
  ) => void;
  onResolveDecision: (
    decision: DecisionRequest,
    answers: DecisionAnswer[],
  ) => void | Promise<boolean>;
  onSearchChange: (query: string) => void;
  onSearchClose: () => void;
  onTogglePin: (messageId: string) => void;
};

export function ChatPanelContextViews({
  approvals,
  decisions,
  submittingDecisionIds,
  error,
  pinnedMessages,
  searchOpen,
  searchQuery,
  onClearPinned,
  onResolveApproval,
  onResolveDecision,
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

      {decisions.map((decision) => (
        <DecisionCard
          key={decision.id}
          decision={decision}
          submitting={submittingDecisionIds.has(decision.id)}
          onSubmit={(answers) => onResolveDecision(decision, answers)}
        />
      ))}

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
