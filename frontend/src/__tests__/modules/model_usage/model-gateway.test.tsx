// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { server } from "@/__mocks__/msw/server";
import { queryKeys } from "@/lib/query-keys";
import {
  useInitCustomNewApi,
  useModelGatewayConfig,
  useSaveOfficialConfig,
  type ModelGatewayConfig,
} from "@/modules/model_usage/public";

const gatewayConfig: ModelGatewayConfig = {
  mode: "official",
  effective: {
    source: "official",
    baseUrl: "https://gateway.example.com/v1",
    apiKeyPreview: "sk-***",
    configured: true,
  },
  official: {
    source: "database",
    baseUrl: "https://gateway.example.com/v1",
    apiKeyPreview: "sk-***",
    configured: true,
    environment: {
      baseUrl: "https://fallback.example.com/v1",
      apiKeyPreview: "env-***",
      configured: true,
    },
  },
  custom: {
    baseUrl: "",
    apiKeyPreview: "",
    configured: false,
    adminBaseUrl: "",
    tokenName: "",
    tokenId: "",
  },
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe("Model Usage model gateway queries", () => {
  it("loads the model gateway config through the public module API", async () => {
    const queryClient = createQueryClient();
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/model-gateway/config",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({ ok: true, data: gatewayConfig });
        },
      ),
    );

    const { result } = renderHook(() => useModelGatewayConfig(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/model-gateway/config");
    expect(result.current.data).toEqual({ ok: true, data: gatewayConfig });
  });

  it("invalidates config only after custom NewAPI initialization succeeds", async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    let succeeds = false;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/model-gateway/custom/newapi/init",
        () =>
          succeeds
            ? HttpResponse.json({
                ok: true,
                data: {
                  mode: "custom",
                  newApiAdminBaseUrl: "http://localhost:3001",
                  newApiBaseUrl: "http://localhost:3001/v1",
                },
              })
            : HttpResponse.json({ detail: "初始化失败" }, { status: 400 }),
      ),
    );

    const { result } = renderHook(() => useInitCustomNewApi(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        newApiBaseUrl: "http://localhost:3001",
      });
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    succeeds = true;
    await act(async () => {
      await result.current.mutateAsync({
        newApiBaseUrl: "http://localhost:3001",
      });
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.modelGateway(),
    });
  });

  it("invalidates config after saving the official gateway", async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    let receivedBody: unknown;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/model-gateway/official/config",
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({ ok: true, data: gatewayConfig });
        },
      ),
    );

    const { result } = renderHook(() => useSaveOfficialConfig(), {
      wrapper: createWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync({ newApiApiKey: "secret-key" });
    });

    expect(receivedBody).toEqual({ newApiApiKey: "secret-key" });
    expect(result.current.data).toEqual({ ok: true, data: gatewayConfig });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.modelGateway(),
    });
  });
});
