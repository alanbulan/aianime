// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createCharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import type { CharacterGateway } from "@/modules/asset_world/application/ports";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("identity owner index", () => {
  it("uses identities embedded in the character catalog without per-character requests", async () => {
    const listIdentities = vi.fn();
    const gateway = {
      listCharacters: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          {
            name: "秦",
            identities: [
              { identity_id: "qin_youth", identity_name: "青年" },
            ],
          },
          {
            name: "林",
            identities: [
              { identity_id: "lin_child", identity_name: "童年" },
            ],
          },
        ],
      }),
      listIdentities,
    } as unknown as CharacterGateway;
    const { useIdentityOwnerIndex } = createCharacterQueryHooks(gateway);

    const { result } = renderHook(() => useIdentityOwnerIndex("demo"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ownerOf("qin_youth")).toBe("秦");
    expect(result.current.ownerOf("lin_child")).toBe("林");
    expect(listIdentities).not.toHaveBeenCalled();
  });
});
