// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
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

import { useCreateIdentity } from "@/modules/asset_world/public";

const server = setupServer();
const querySource = readFileSync(
  "src/modules/asset_world/application/ports.ts",
  "utf-8",
);
const createIdentitySource = querySource.slice(
  querySource.indexOf("export interface CreateIdentityInput"),
  querySource.indexOf("export interface UpdateIdentityInput"),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("identity create query hook", () => {
  it("types age group as part of create identity input", () => {
    expect(createIdentitySource).toContain("age_group?: string");
  });

  it("posts age group when creating an identity", async () => {
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/identities",
        async ({ request }) => {
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            data: {
              identity_id: "秦_幼年",
              identity_name: "幼年",
              age_group: "child",
              appearance_details: "粗布短衫",
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useCreateIdentity("demo", "秦"), {
      wrapper,
    });
    result.current.mutate({
      identity_name: "幼年",
      age_group: "child",
      appearance_details: "粗布短衫",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(body).toEqual({
      identity_name: "幼年",
      age_group: "child",
      appearance_details: "粗布短衫",
    });
  });
});
