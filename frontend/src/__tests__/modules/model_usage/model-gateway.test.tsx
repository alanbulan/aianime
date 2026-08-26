import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { server } from "@/__tests__/setup-msw";
import {
  useModelGatewayConfig,
  type ModelGatewayConfig,
} from "@/modules/model_usage/public";

const gatewayConfig: ModelGatewayConfig = {
  mode: "cloud",
  effective: { source: "cloud_proxy", configured: true },
  cloud: { configured: true, managed: true },
  byok: {
    allowed: false,
    configured: false,
    baseUrl: "",
    apiKeyPreview: "",
  },
};

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe("Model Usage gateway queries", () => {
  it("loads only the cloud/BYOK runtime status", async () => {
    const client = queryClient();
    server.use(
      http.get("http://localhost:3000/api/v1/model-gateway/config", () =>
        HttpResponse.json({ ok: true, data: gatewayConfig }),
      ),
    );

    const { result } = renderHook(() => useModelGatewayConfig(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.data.mode).toBe("cloud");
    expect(result.current.data?.data).not.toHaveProperty("official");
    expect(result.current.data?.data).not.toHaveProperty("custom");
    expect(result.current.data?.data).not.toHaveProperty("mediaRelay");
  });
});
