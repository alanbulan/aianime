import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBudgetConfirmationController } from "./budget-confirmation-controller";
import type { BudgetConfirmationGateway } from "./budget-confirmation-ports";
import type { BudgetConfirmationState } from "../domain/budget-confirmation";

const snapshot = (revision: number, suffix = "1"): BudgetConfirmationState => ({ revision, pendingCount: 1, request: {
  requestId: `11111111-1111-4111-8111-11111111111${suffix}`, modelCode: "H3", modelName: "MiniMax H3",
  estimatedMicroPoints: "2160000000", maximumMicroPoints: "2160000000", tenantMultiplier: "1.000000000000000000",
  expiresAt: "2027-01-01T00:00:00Z", policyVersion: 2, estimateOnly: true,
} });

describe("billing confirmation IPC synchronization", () => {
  it("subscribes before snapshot and rejects stale read completions", async () => {
    let listener!: (state: BudgetConfirmationState) => void;
    let resolve!: (state: BudgetConfirmationState) => void;
    const unsubscribe = vi.fn();
    const gateway: BudgetConfirmationGateway = {
      subscribe: (next) => { listener = next; return unsubscribe; },
      read: () => new Promise((done) => { resolve = done; }), decide: vi.fn(),
    };
    const hook = renderHook(createBudgetConfirmationController(gateway));
    act(() => listener(snapshot(2, "2")));
    await act(async () => resolve(snapshot(1)));
    expect(hook.result.current.state).toEqual(snapshot(2, "2"));
    hook.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("acknowledges only the requested ID and recovers the next prompt without approving it", async () => {
    const next = snapshot(3, "2");
    const gateway: BudgetConfirmationGateway = {
      subscribe: () => () => {},
      read: vi.fn().mockResolvedValueOnce(snapshot(1)).mockResolvedValue(next),
      decide: vi.fn().mockResolvedValue(true),
    };
    const hook = renderHook(createBudgetConfirmationController(gateway));
    await waitFor(() => expect(hook.result.current.state.revision).toBe(1));
    await act(async () => { await hook.result.current.decide(snapshot(1).request!.requestId, "cancel"); });
    expect(gateway.decide).toHaveBeenCalledExactlyOnceWith(snapshot(1).request!.requestId, "cancel");
    expect(hook.result.current.state).toEqual(next);
    hook.unmount();
  });
});
