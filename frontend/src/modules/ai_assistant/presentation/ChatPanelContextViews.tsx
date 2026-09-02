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
import { cn } from "@/lib/utils";

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

export type ChatPanelActionViewsProps = Pick<
  ChatPanelContextViewsProps,
  | "approvals"
  | "decisions"
  | "submittingDecisionIds"
  | "onResolveApproval"
  | "onResolveDecision"
> & {
  isFreezoneLayout: boolean;
};

export function ChatPanelContextViews({
  error,
  pinnedMessages,
  searchOpen,
  searchQuery,
  onClearPinned,
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

export function ChatPanelActionViews({
  approvals,
  decisions,
  submittingDecisionIds,
  isFreezoneLayout,
  onResolveApproval,
  onResolveDecision,
}: ChatPanelActionViewsProps) {
  if (decisions.length === 0 && approvals.length === 0) return null;

  return (
    <div
      data-chat-action-views=""
      className="shrink-0 px-3 pb-2 pt-1"
    >
      <div className={cn(
        "mx-auto max-h-[min(40vh,22rem)] w-full max-w-[760px] space-y-2 overflow-y-auto [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin]",
        isFreezoneLayout && "max-w-none",
      )}>
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
      </div>
    </div>
  );
}
