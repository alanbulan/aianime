import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";
import type { CommercialInvocation } from "../domain/commercial-invocation";
import type { CommercialInvocationGateway } from "./commercial-invocation-ports";
import { createCommercialInvocationQueries } from "./commercial-invocation-queries";

const pending: CommercialInvocation = {
  id: "invocation-1", modelCode: "image-model", operation: "IMAGE_GENERATION",
  executionMode: "SYNC", status: "CANCEL_REQUESTED", quotaStatus: "HELD",
  reservationId: "reservation-1", reservedUnits: 1, chargedUnits: 0, refundedUnits: 0,
  balanceBefore: 10, balanceAfter: 9, errorCode: "", errorMessage: "",
  createdAt: "2026-09-02T09:00:00Z", startedAt: "2026-09-02T09:00:00Z",
  completedAt: "", durationMs: 0,
};
const released = { ...pending, status: "CANCELLED", quotaStatus: "RELEASED", refundedUnits: 1 };

function setup() {
  const gateway = {
    list: vi.fn<CommercialInvocationGateway["list"]>().mockResolvedValue({ items: [pending], total: 1, page: 1, pageSize: 20 }),
    details: vi.fn<CommercialInvocationGateway["details"]>().mockResolvedValue(pending),
    cancel: vi.fn<CommercialInvocationGateway["cancel"]>().mockResolvedValue(pending),
    saveResult: vi.fn<CommercialInvocationGateway["saveResult"]>().mockResolvedValue({ saved: false }),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { gateway, client, wrapper, hooks: createCommercialInvocationQueries(gateway) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("invocation and quota refresh", () => {
  it("refreshes the visible call history and stops when the section is hidden", async () => {
    const { gateway, hooks, wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ enabled }) => hooks.useCommercialInvocations({ page: 1, pageSize: 20 }, enabled),
      { wrapper, initialProps: { enabled: true } },
    );
    await act(async () => { await vi.waitFor(() => expect(result.current.data).toBeDefined()); });
    expect(gateway.list).toHaveBeenCalledTimes(1);
    gateway.list.mockResolvedValue({ items: [released], total: 1, page: 1, pageSize: 20 });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(gateway.list).toHaveBeenCalledTimes(2);
    expect(result.current.data?.items[0].status).toBe("CANCELLED");
    rerender({ enabled: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(gateway.list).toHaveBeenCalledTimes(2);
  });

  it("keeps refreshing after execution cancellation until quota settlement finishes", async () => {
    const { gateway, client, hooks, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => hooks.useCommercialInvocationDetails(pending.id), { wrapper });
    await act(async () => { await vi.waitFor(() => expect(result.current.data).toBeDefined()); });
    gateway.details.mockResolvedValue({ ...pending, status: "CANCELLED" });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(gateway.details).toHaveBeenCalledTimes(2);
    expect(result.current.data?.quotaStatus).toBe("HELD");
    invalidate.mockClear();
    gateway.details.mockResolvedValue(released);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(gateway.details).toHaveBeenCalledTimes(3);
    expect(result.current.data?.quotaStatus).toBe("RELEASED");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.commercialQuota() });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(gateway.details).toHaveBeenCalledTimes(3);
  });

  it("does not query a hidden detail or a missing invocation ID", async () => {
    const { gateway, hooks, wrapper } = setup();
    const { rerender } = renderHook(
      ({ id, enabled }: { id: string | null; enabled: boolean }) => hooks.useCommercialInvocationDetails(id, enabled),
      { wrapper, initialProps: { id: null as string | null, enabled: true } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    rerender({ id: pending.id, enabled: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(gateway.details).not.toHaveBeenCalled();
  });
});
