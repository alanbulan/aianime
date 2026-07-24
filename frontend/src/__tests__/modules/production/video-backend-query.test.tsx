// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { server } from "@/__mocks__/msw/server";
import { useVideoBackends } from "@/modules/production/public";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Production video backend query", () => {
  it("loads canonical backend options through the Production gateway", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/video-backends",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: [
              {
                value: "huimeng_seedance-1.0-pro-fast",
                label: "HuiMeng Seedance 1.0 Pro Fast",
                is_default: true,
                is_seedance2: false,
                dialogue_only: false,
              },
              {
                value: "huimeng_seedance-2.0-fast",
                label: "HuiMeng Seedance 2.0 Fast",
                is_default: false,
                is_seedance2: true,
                dialogue_only: false,
              },
            ],
          });
        },
      ),
    );

    const { result } = renderHook(() => useVideoBackends("demo"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/video-backends");
    expect(result.current.data?.data[0]?.value).toBe(
      "huimeng_seedance-1.0-pro-fast",
    );
  });
});
