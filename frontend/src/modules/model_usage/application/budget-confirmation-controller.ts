import { useCallback, useEffect, useRef, useState } from "react";
import type { BudgetConfirmationGateway } from "@/modules/model_usage/application/budget-confirmation-ports";
import { EMPTY_BUDGET_STATE, type BudgetConfirmationState } from "@/modules/model_usage/domain/budget-confirmation";

export function createBudgetConfirmationController(gateway: BudgetConfirmationGateway) {
  return function useBudgetConfirmation() {
    const [state, setState] = useState(EMPTY_BUDGET_STATE);
    const revision = useRef(-1);
    const mounted = useRef(false);
    const receive = useCallback((next: BudgetConfirmationState) => {
      // An event may arrive before the initial IPC read finishes.
      if (!mounted.current || next.revision < revision.current) return;
      revision.current = next.revision;
      setState(next);
    }, []);
    useEffect(() => {
      mounted.current = true;
      let live = true;
      const unsubscribe = gateway.subscribe((next) => { if (live) receive(next); });
      void gateway.read().then((next) => { if (live) receive(next); }).catch(() => {});
      return () => { live = false; mounted.current = false; unsubscribe(); };
    }, [receive]);
    const decide = useCallback(async (id: string, decision: "accept" | "cancel") => {
      const applied = await gateway.decide(id, decision);
      // Recover a lost notification without resending an authorization decision.
      const current = await gateway.read();
      receive(current);
      return applied;
    }, [receive]);
    return { state, decide };
  };
}
