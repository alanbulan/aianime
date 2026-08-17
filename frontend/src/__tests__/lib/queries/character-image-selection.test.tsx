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

import {
  useAssetImageSourceSelection,
  useUpdateAssetImageSourceSelection,
  useCharacterImageSelection,
} from "@/modules/asset_world/public";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("character image selection query hooks", () => {
  it("fetches the project-level character image selection", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/character-image-selection",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              character_image_selection: "identity",
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useCharacterImageSelection("demo"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/character-image-selection");
    expect(result.current.data?.data.character_image_selection).toBe("identity");
  });

  it("fetches an asset-kind image source selection", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/image-source-selection/scene",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              asset_kind: "scene",
              image_source_selection: "image-platform-sku",
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () => useAssetImageSourceSelection("demo", "scene"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/image-source-selection/scene",
    );
    expect(result.current.data?.data.image_source_selection).toBe(
      "image-platform-sku",
    );
  });

  it("updates an asset-kind image source selection", async () => {
    let requestedPath = "";
    let patchBody: unknown = null;
    server.use(
      http.patch(
        "http://localhost:3000/api/v1/projects/demo/image-source-selection/prop",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          patchBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            data: {
              asset_kind: "prop",
              image_source_selection: "newapi_nanobanana2",
              options: {
                newapi_gpt_image2: "LingShan-G2",
                newapi_nanobanana2: "LingShan-NB-2",
              },
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () => useUpdateAssetImageSourceSelection("demo", "prop"),
      { wrapper },
    );

    result.current.mutate("newapi_nanobanana2");

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/image-source-selection/prop",
    );
    expect(patchBody).toEqual({ image_source_selection: "newapi_nanobanana2" });
  });
});
