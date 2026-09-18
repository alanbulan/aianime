import { getCommercialBridge, invokeCommercial, requireCommercialBridge } from "@/shared/commercial-bridge";
import type { BudgetConfirmationGateway } from "@/modules/model_usage/application/budget-confirmation-ports";
import { EMPTY_BUDGET_STATE, parseBudgetConfirmation } from "@/modules/model_usage/domain/budget-confirmation";

export const electronBudgetConfirmationGateway: BudgetConfirmationGateway = {
  async read() {
    const bridge = getCommercialBridge();
    if (!bridge) return EMPTY_BUDGET_STATE;
    return parseBudgetConfirmation(await invokeCommercial(() => bridge.budgetSnapshot()));
  },
  subscribe(listener) {
    const bridge = getCommercialBridge();
    if (!bridge) return () => {};
    return bridge.onBudgetChanged((raw) => {
      // Do not surface an unvalidated amount or unhandled event exception.
      try { listener(parseBudgetConfirmation(raw)); } catch { /* Main's expiry cancels malformed prompts. */ }
    });
  },
  async decide(requestId, decision) {
    const result = await invokeCommercial(() => requireCommercialBridge().respondBudget({ requestId, decision }));
    if (!result || typeof result.applied !== "boolean") throw new Error("Invalid budget decision acknowledgement");
    return result.applied;
  },
};
