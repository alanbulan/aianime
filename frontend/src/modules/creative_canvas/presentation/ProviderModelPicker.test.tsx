import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const states = vi.hoisted(() => ({
  image: { models: [], isLoading: false, error: null as Error | null },
  video: { models: [], isLoading: false, error: null as Error | null },
}));

vi.mock("@/modules/creative_canvas/generationCatalogComposition", () => ({
  useCanvasImageModels: () => states.image,
  useCanvasVideoModels: () => states.video,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "modelPicker.loading": "Loading models",
        "modelPicker.loadFailed": "Failed to load the model catalog",
        "modelPicker.empty": "No models available",
      })[key] ?? key,
  }),
}));

import { ProviderModelPicker } from "./ProviderModelPicker";

describe("ProviderModelPicker catalog states", () => {
  beforeEach(() => {
    states.image = { models: [], isLoading: false, error: null };
    states.video = { models: [], isLoading: false, error: null };
  });

  it("shows a loading state while the authenticated catalog is pending", () => {
    states.image = { models: [], isLoading: true, error: null };

    render(
      <ProviderModelPicker
        projectId="project-1"
        selectedModelId=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading models")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows a distinct failure state without falling back to static models", () => {
    states.image = {
      models: [],
      isLoading: false,
      error: new Error("catalog offline"),
    };

    render(
      <ProviderModelPicker
        projectId="project-1"
        selectedModelId=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Failed to load the model catalog")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows an empty state when the authenticated catalog has no models", () => {
    render(
      <ProviderModelPicker
        projectId="project-1"
        selectedModelId=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("No models available")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
