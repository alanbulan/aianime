// Copyright (c) 2026 AI anime
import { useRef, useState } from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { IdentityCardController } from "@/modules/asset_world/application/use-identity-card-controller";
import { IdentityCardView } from "@/modules/asset_world/presentation/CharactersPageView";

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => true,
}));

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
});

function IdentityCardHarness() {
  const [generateImageOpen, setGenerateImageOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const costumeInputRef = useRef<HTMLInputElement>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const controller = {
    ageLabel: "Middle",
    appearance: "green robe and clean silhouette",
    appearanceDirty: false,
    bodyType: "slim",
    changeAgeGroup: vi.fn(),
    characterName: "Li Qing",
    confirmDelete: vi.fn(),
    costumeInputRef,
    deleteCostumePending: false,
    deleteImageOpen: false,
    deleteImagePending: false,
    deleteOpen: false,
    deletePending: false,
    facePrompt: "sharp eyes",
    generateImageBusy: false,
    generateImageOpen,
    generatePortraitBusy: false,
    generatePortraitOpen: false,
    identity: {
      identity_id: "id-middle",
      identity_name: "Middle",
      appearance_details: "green robe and clean silhouette",
      face_prompt: "sharp eyes",
      age_group: "middle",
      body_type: "slim",
      image_url: "",
      portrait_image_url: "",
      costume_image_url: "",
    },
    identityAge: "middle",
    imageAttempts: 0,
    imageInputRef,
    isAgeVariant: true,
    portraitAttempts: 0,
    portraitInputRef,
    project: "demo",
    referenceCount: 0,
    references: [],
    referencesDirty: false,
    removeCostume: vi.fn(),
    removeImage: vi.fn(),
    rename: vi.fn(),
    renameOpen: false,
    renameValue: "Middle",
    requestGeneratePortrait: vi.fn(),
    requestPortraitUpload: vi.fn(),
    roleLabel: "Lead",
    runGenerateImage: vi.fn(),
    runGeneratePortrait: vi.fn(),
    saveAppearance: vi.fn(),
    saveReferences: vi.fn(),
    setAppearance: vi.fn(),
    setBodyType: vi.fn(),
    setDeleteImageOpen: vi.fn(),
    setDeleteOpen: vi.fn(),
    setFacePrompt: vi.fn(),
    setGenerateImageOpen,
    setGeneratePortraitOpen: vi.fn(),
    setRenameOpen: vi.fn(),
    setRenameValue: vi.fn(),
    updatePending: false,
    upload: vi.fn(),
    uploadCostumePending: false,
    uploadImagePending: false,
    uploadPortraitPending: false,
  } as unknown as IdentityCardController;

  return (
    <IdentityCardView
      controller={controller}
      costumeHistory={null}
      imageHistory={null}
      portraitHistory={null}
    />
  );
}

describe("characters page CE generation dialogs", () => {
  it("opens the identity generation confirmation dialog", async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <IdentityCardHarness />
      </I18nextProvider>,
    );

    expect(screen.getByText("Middle")).toBeInTheDocument();
    const identityGenerate = screen
      .getAllByRole("button", { name: "characters.identities.generate" })
      .find((button) => !button.hasAttribute("disabled"));
    expect(identityGenerate).toBeDefined();
    await user.click(identityGenerate!);

    const dialog = await screen.findByRole("alertdialog");
    const dialogAction = within(dialog).getByRole("button", {
      name: "characters.identities.generate",
    });
    await waitFor(() =>
      expect(dialogAction.closest("[role='alertdialog']")).toBeTruthy(),
    );

  });
});
