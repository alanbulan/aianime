// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ky from "ky";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => {
  const api = ky.create({ baseUrl: "http://localhost:3000/" });
  return { api, uploadApi: api.extend({ timeout: false }) };
});

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/modules/task_execution/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  useTaskController: () => ({ started: false, start: vi.fn() }),
}));

import { useDeleteIdentityCostume } from "@/modules/asset_world/public";
import { createCharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import { createUseIdentityCardController } from "@/modules/asset_world/application/use-identity-card-controller";
import { httpCharacterGateway } from "@/modules/asset_world/infrastructure/http-character-gateway";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("identity costume query hooks", () => {
  it("posts to the identity costume delete endpoint", async () => {
    let requestedPath = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/identities/id-1/costume/delete",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: { deleted: true },
          });
        },
      ),
    );

    const { result } = renderHook(() => useDeleteIdentityCostume("demo", "秦"), {
      wrapper,
    });
    result.current.mutate("id-1");

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/characters/%E7%A7%A6/identities/id-1/costume/delete",
    );
    expect(result.current.data?.data.deleted).toBe(true);
  });
});

const useController = createUseIdentityCardController(
  createCharacterQueryHooks({
    ...httpCharacterGateway,
    getIdentityAttempts: async () => ({
      ok: true,
      data: { image_attempts: 0, portrait_attempts: 0 },
    }),
  }),
);

describe("identity main image upload", () => {
  it.each([true, false])(
    "sends the current identity ID in multipart and reports upload success=%s",
    async (ok) => {
      const identity = {
        identity_id: "秦_少年/战损?",
        identity_name: "少年/战损?",
      };
      const backendError = `Identity '${identity.identity_id}' not found`;
      let uploadedId: FormDataEntryValue | null = null;
      let uploadedFilename: string | undefined;
      let uploadedContent: string | undefined;
      server.use(
        http.post(
          "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/identities/image/upload",
          async ({ request }) => {
            const form = await request.formData();
            uploadedId = form.get("identity_id");
            const file = form.get("file") as File;
            uploadedFilename = file.name;
            uploadedContent = await file.text();
            return HttpResponse.json(
              ok
                ? { ok: true, data: { image_url: "/media/少年_战损_.png" } }
                : { ok: false, error: backendError },
            );
          },
        ),
      );
      const { result } = renderHook(
        () => useController({
          project: "demo",
          characterName: "秦",
          identity,
          ageLabel: "少年",
          roleLabel: "主角",
          onAttempt: vi.fn(),
        }),
        { wrapper },
      );

      await act(async () => {
        await result.current.upload(
          "image", new File(["image bytes"], "identity.png", { type: "image/png" }),
        );
      });

      expect(uploadedId).toBe(identity.identity_id);
      expect(uploadedFilename).toBe("identity.png");
      expect(uploadedContent).toBe("image bytes");
      if (ok) {
        expect(toastSuccess).toHaveBeenCalledWith("characters.toasts.imageUploading");
        expect(toastError).not.toHaveBeenCalled();
      } else {
        expect(toastError).toHaveBeenCalledWith(backendError);
        expect(toastSuccess).not.toHaveBeenCalled();
      }
    },
  );
});
