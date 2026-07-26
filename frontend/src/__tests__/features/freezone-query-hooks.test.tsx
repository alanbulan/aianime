// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createFreezoneCanvasQueryHooks } from "@/features/canvas/application/freezoneCanvasQueryHooks";
import { createFreezoneContextQueryHooks } from "@/features/freezone/application/contextQueryHooks";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Freezone query hooks", () => {
  it("shares one canvas list request for a matching project", async () => {
    const listCanvases = vi.fn().mockResolvedValue([]);
    const { useFreezoneCanvases } = createFreezoneCanvasQueryHooks({
      listCanvases,
    });

    renderHook(
      () => [useFreezoneCanvases("demo"), useFreezoneCanvases("demo")],
      { wrapper },
    );

    await vi.waitFor(() => expect(listCanvases).toHaveBeenCalledTimes(1));
    expect(listCanvases).toHaveBeenCalledWith({
      projectId: "demo",
      signal: expect.any(AbortSignal),
    });
  });

  it("shares one project asset request for a matching project", async () => {
    const listProjectAssets = vi.fn().mockResolvedValue([]);
    const listBeatContext = vi.fn();
    const { useFreezoneProjectAssets } = createFreezoneContextQueryHooks({
      listProjectAssets,
      listBeatContext,
    });

    renderHook(
      () => [
        useFreezoneProjectAssets("demo"),
        useFreezoneProjectAssets("demo"),
      ],
      { wrapper },
    );

    await vi.waitFor(() => expect(listProjectAssets).toHaveBeenCalledTimes(1));
    expect(listProjectAssets).toHaveBeenCalledWith("demo", {
      signal: expect.any(AbortSignal),
    });
  });

  it("shares one request for a matching project and Beat Context scope", async () => {
    const listProjectAssets = vi.fn();
    const listBeatContext = vi.fn().mockResolvedValue({
      scope: { episode: 1, beat: 2 },
      episodes: [],
      assets: [],
    });
    const { useFreezoneBeatContext } = createFreezoneContextQueryHooks({
      listProjectAssets,
      listBeatContext,
    });

    renderHook(
      () => [
        useFreezoneBeatContext("demo", { episode: 1, beat: 2 }),
        useFreezoneBeatContext("demo", { episode: 1, beat: 2 }),
      ],
      { wrapper },
    );

    await vi.waitFor(() => expect(listBeatContext).toHaveBeenCalledTimes(1));
    expect(listBeatContext).toHaveBeenCalledWith("demo", {
      episode: 1,
      beat: 2,
      signal: expect.any(AbortSignal),
    });
  });
});
