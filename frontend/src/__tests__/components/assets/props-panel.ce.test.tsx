// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AssetHeaderActionsSlotProvider,
  AssetHeaderActionsTarget,
} from "@/components/assets/asset-header-actions-slot";
import type { PropsPanelController } from "@/modules/asset_world/application/use-props-panel-controller";
import type { PropAsset } from "@/modules/asset_world/domain/prop";
import { PropAssetCardView } from "@/modules/asset_world/presentation/PropAssetCardView";
import { PropsPanelView } from "@/modules/asset_world/presentation/PropsPanelView";

const runtimeState = vi.hoisted(() => ({ isCeRuntime: true }));

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => runtimeState.isCeRuntime,
}));

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          common: {
            loading: "Loading",
            refresh: "Refresh",
          },
          assets: {
            common: {
              delete: "Delete",
              edit: "Edit",
              generated: "generated",
              missing: "missing",
              noMatch: "No match",
              searchProps: "Search props",
            },
            props: {
              batchGenerate: "Batch generate refs",
              batchStatusTitle: "Batch reference generation",
              newProp: "New prop",
              newPropHint: "Create a prop.",
              emptyTitle: "No props yet",
              emptyDescription: "Create a prop.",
              reference: "Reference",
              noReference: "Reference image missing",
              noDescription: "No description",
              generateReference: "Generate reference",
              regenerateReference: "Regenerate reference",
              generatingReference: "Generating...",
              uploadReference: "Upload reference",
              uploadingReference: "Uploading...",
              openFreezone: "Open Freezone",
              openFreezoneTip: "Open Freezone",
              owner: "Owner",
              types: { object: "Object" },
            },
          },
        },
      },
    },
  });
});

function classNameContains(container: HTMLElement, token: string) {
  return Array.from(container.querySelectorAll("*")).some((node) =>
    String(node.getAttribute("class") ?? "").includes(token),
  );
}

const prop: PropAsset = {
  name: "Moon Fan",
  aliases: [],
  prop_type: "object",
  visual_prompt: "silver fan",
  description: "folded silver fan",
  owner: "",
  notes: "",
  reference_url: "",
};

function renderPanel() {
  const controller = {
    allItems: [prop],
    batchCurrentTask: "",
    batchGeneratePending: false,
    batchLogs: [],
    batchProgress: 0,
    batchReferenceCost: "12 credits",
    batchStopping: false,
    gridRef: { current: null },
    handleBatchGenerate: vi.fn(),
    isLoading: false,
    isRefetching: false,
    items: [prop],
    openNewProp: vi.fn(),
    refresh: vi.fn(async () => true),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    setSortKey: vi.fn(),
    showBatchTask: false,
    sortKey: "name",
    stopBatch: vi.fn(),
  } as unknown as PropsPanelController;

  return render(
    <I18nextProvider i18n={i18n}>
      <AssetHeaderActionsSlotProvider>
        <AssetHeaderActionsTarget />
        <PropsPanelView
          controller={controller}
          dialogContent={null}
          imageSourceControl={null}
          renderPropCard={(item) => (
            <PropAssetCardView
              prop={item}
              referenceCost="12 credits"
              onEdit={vi.fn()}
              onDelete={vi.fn()}
              onGenerateReference={vi.fn()}
              onUploadReference={vi.fn()}
              onOpenFreezone={vi.fn()}
            />
          )}
        />
      </AssetHeaderActionsSlotProvider>
    </I18nextProvider>,
  );
}

describe("PropsPanel CE generation credit gating", () => {
  beforeEach(() => {
    runtimeState.isCeRuntime = true;
  });

  it("hides single and batch prop reference costs without credit styling", async () => {
    const { container } = renderPanel();

    expect(await screen.findByText("Moon Fan")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Batch generate refs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate reference" }),
    ).toBeInTheDocument();

    expect(screen.queryByText("12 credits")).not.toBeInTheDocument();
    expect(classNameContains(container, "#007A87")).toBe(false);
  });
});
