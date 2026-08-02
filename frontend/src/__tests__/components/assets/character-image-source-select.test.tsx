// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ky from "ky";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { CharacterImageSourceSelect } from "@/components/assets/character-image-source-select";
import { clearCommercialModelCatalogCache } from "@/modules/model_usage/public";

const server = setupServer();
const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          characters: {
            imageSource: {
              label: "Image source",
              loading: "Loading image source",
              selectModel: "Select an image model",
              empty: "No image models available",
              loadFailed: "Failed to load the image model catalog",
              saveFailed: "Failed to update image source",
            },
          },
        },
      },
    },
  });
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
  clearCommercialModelCatalogCache();
});
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

function installImageCatalog() {
  Object.defineProperty(window, "aiAnimeDesktop", {
    configurable: true,
    value: {
      commercial: {
        modelCatalog: vi.fn(async () => ({
          catalogVersion: "catalog-v1",
          items: [
            {
              id: "portrait",
              code: "portrait",
              displayName: "Character portrait",
              operation: "IMAGE",
              capabilityJson: "{}",
              parameterSchemaJson: "{}",
            },
            {
              id: "identity",
              code: "identity",
              displayName: "Identity image",
              operation: "IMAGE",
              capabilityJson: "{}",
              parameterSchemaJson: "{}",
            },
          ],
        })),
      },
    },
  });
}

describe("CharacterImageSourceSelect", () => {
  it("renders models from the authenticated commercial catalog", async () => {
    installImageCatalog();
    const user = userEvent.setup();
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/image-source-selection/character",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              asset_kind: "character",
              image_source_selection: "identity",
            },
          }),
      ),
    );

    render(<CharacterImageSourceSelect project="demo" />, { wrapper });

    expect(await screen.findByText("Image source")).toBeInTheDocument();
    const trigger = await screen.findByRole("combobox", {
      name: "Image source",
    });
    expect(trigger).toHaveTextContent("Identity image");

    await user.click(trigger);

    expect(
      await screen.findByRole("option", { name: "Character portrait" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Identity image" }),
    ).toBeInTheDocument();
  });

  it("patches the selected image source when the user changes options", async () => {
    installImageCatalog();
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    let currentSelection = "identity";
    let requestedPath = "";
    let patchBody: unknown = null;
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/image-source-selection/character",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              asset_kind: "character",
              image_source_selection: currentSelection,
            },
          }),
      ),
      http.patch(
        "http://localhost:3000/api/v1/projects/demo/image-source-selection/character",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          patchBody = await request.json();
          currentSelection = "portrait";
          return HttpResponse.json({
            ok: true,
            data: {
              asset_kind: "character",
              image_source_selection: currentSelection,
            },
          });
        },
      ),
    );

    render(
      <CharacterImageSourceSelect
        project="demo"
        onSelectionChange={onSelectionChange}
      />,
      { wrapper },
    );

    const trigger = await screen.findByRole("combobox", {
      name: "Image source",
    });
    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: "Character portrait" }),
    );

    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/image-source-selection/character",
    );
    expect(patchBody).toEqual({ image_source_selection: "portrait" });
    expect(onSelectionChange).toHaveBeenCalledWith("portrait");
  });

  it("distinguishes a catalog failure from an empty catalog", async () => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: {
        commercial: {
          modelCatalog: vi.fn().mockRejectedValue(new Error("catalog offline")),
        },
      },
    });
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/image-source-selection/character",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              asset_kind: "character",
              image_source_selection: "",
            },
          }),
      ),
    );

    render(<CharacterImageSourceSelect project="demo" />, { wrapper });

    const trigger = await screen.findByRole("combobox", { name: "Image source" });
    await waitFor(() =>
      expect(trigger).toHaveTextContent("Failed to load the image model catalog"),
    );
    expect(trigger).toBeDisabled();
  });

  it("shows an empty state when the authenticated IMAGE catalog is empty", async () => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: {
        commercial: {
          modelCatalog: vi.fn(async () => ({
            catalogVersion: "catalog-v1",
            items: [],
          })),
        },
      },
    });
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/image-source-selection/character",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              asset_kind: "character",
              image_source_selection: "",
            },
          }),
      ),
    );

    render(<CharacterImageSourceSelect project="demo" />, { wrapper });

    const trigger = await screen.findByRole("combobox", { name: "Image source" });
    await waitFor(() =>
      expect(trigger).toHaveTextContent("No image models available"),
    );
    expect(trigger).toBeDisabled();
  });
});
