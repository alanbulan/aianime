// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ky from "ky";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { createUseAssetReferenceIndex } from "@/modules/asset_world/application/use-asset-reference-index";
import { httpAssetReferenceGateway } from "@/modules/asset_world/infrastructure/http-asset-reference-gateway";

const server = setupServer();
const useAssetReferenceIndex = createUseAssetReferenceIndex(
  httpAssetReferenceGateway,
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("asset reference index", () => {
  it("loads every asset reference with one project request", async () => {
    let requestCount = 0;
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/assets/references",
        () => {
          requestCount += 1;
          return HttpResponse.json({
            ok: true,
            data: {
              references: {
                identity: {
                  hero_young: [{ episode: 1, beat_number: 2 }],
                },
                prop: {},
                scene: {
                  classroom: [
                    { episode: 1, beat_number: 2 },
                    { episode: 2, beat_number: 1 },
                  ],
                },
              },
              scene_co_occurrences: {
                classroom: { identities: ["hero_young"], props: ["book"] },
              },
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useAssetReferenceIndex("demo"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(requestCount).toBe(1);
    expect(result.current.countFor("scene", "classroom")).toBe(2);
    expect(result.current.referencesFor("identity", "hero_young")).toEqual([
      { episode: 1, beatNumber: 2 },
    ]);
    expect(result.current.coOccurrenceForScene("classroom")).toEqual({
      identities: ["hero_young"],
      props: ["book"],
    });
  });
});
