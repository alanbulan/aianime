// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAssetLibraryCatalogController } from "./assetLibraryCatalogComposition";

const listFreezoneBeatContext = vi.fn();
const listFreezoneProjectAssets = vi.fn();

vi.mock("./contextQueryComposition", async () => {
  const { createFreezoneContextQueryHooks } = await import(
    "./presentation/contextQueryHooks"
  );
  return createFreezoneContextQueryHooks({
    listBeatContext: (projectId, options) =>
      listFreezoneBeatContext(projectId, options),
    listProjectAssets: (projectId, options) =>
      listFreezoneProjectAssets(projectId, options),
  });
});

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("asset library catalog controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFreezoneProjectAssets.mockResolvedValue([]);
    listFreezoneBeatContext.mockResolvedValue({
      scope: { episode: null, beat: null },
      episodes: [],
      assets: [],
    });
  });

  it("projects catalog data and refetches both queries on reload", async () => {
    const { result, rerender } = renderHook(
      ({ reloadToken }) =>
        useAssetLibraryCatalogController({
          project: "demo",
          metadata: { kind: "default" },
          canvasKind: "default",
          replacementReloadToken: 0,
          reloadToken,
        }),
      { initialProps: { reloadToken: 0 }, wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(listFreezoneProjectAssets).toHaveBeenCalledTimes(1);
      expect(listFreezoneBeatContext).toHaveBeenCalledTimes(1);
    });
    expect(result.current.assets).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.assetImageCacheToken).toBe("0:0");

    act(() => rerender({ reloadToken: 1 }));

    await waitFor(() => {
      expect(listFreezoneProjectAssets).toHaveBeenCalledTimes(2);
      expect(listFreezoneBeatContext).toHaveBeenCalledTimes(2);
    });
    expect(result.current.assetImageCacheToken).toBe("0:1");
  });

  it("does not request Beat context for an asset canvas", async () => {
    const { result } = renderHook(
      () =>
        useAssetLibraryCatalogController({
          project: "demo",
          metadata: { kind: "asset" },
          canvasKind: "asset",
          replacementReloadToken: 0,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(listFreezoneProjectAssets).toHaveBeenCalledTimes(1);
    });
    expect(listFreezoneBeatContext).not.toHaveBeenCalled();
    expect(result.current.beatContext).toBeNull();
  });

  it("normalizes project asset query errors", async () => {
    listFreezoneProjectAssets.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(
      () =>
        useAssetLibraryCatalogController({
          project: "demo",
          metadata: { kind: "default" },
          canvasKind: "default",
          replacementReloadToken: 0,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.error).toBe("network down"));
  });
});
