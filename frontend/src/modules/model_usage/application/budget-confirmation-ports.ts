import type { BudgetConfirmationState } from "@/modules/model_usage/domain/budget-confirmation";

export interface BudgetConfirmationGateway {
  read(): Promise<BudgetConfirmationState>;
  subscribe(listener: (state: BudgetConfirmationState) => void): () => void;
  decide(requestId: string, decision: "accept" | "cancel"): Promise<boolean>;
}
