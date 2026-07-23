// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PropPayload } from "@/modules/asset_world/application/prop-gateway";
import type { BeatReference } from "@/modules/asset_world/domain/character";
import type { PropAsset } from "@/modules/asset_world/domain/prop";

const PROP_FORM_DEFAULT: PropPayload = {
  name: "",
  prop_type: "object",
  visual_prompt: "",
  description: "",
  owner: "",
};

const PROP_TYPE_VALUES = [
  "weapon",
  "accessory",
  "artifact",
  "document",
  "furniture",
  "object",
] as const;

export interface PropDialogControllerOptions {
  initial: PropAsset | null;
  onOpenChange(open: boolean): void;
  onSubmit(data: PropPayload): Promise<void>;
  open: boolean;
  project: string;
  references: BeatReference[];
  saving: boolean;
}

export function createUsePropDialogController() {
  return function usePropDialogController({
    initial,
    onOpenChange,
    onSubmit,
    open,
    project,
    references,
    saving,
  }: PropDialogControllerOptions) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<PropPayload>(PROP_FORM_DEFAULT);

    useEffect(() => {
      setDraft(
        initial
          ? {
              name: initial.name,
              aliases: initial.aliases ?? [],
              prop_type: initial.prop_type ?? "object",
              visual_prompt: initial.visual_prompt ?? "",
              description: initial.description ?? "",
              owner: initial.owner ?? "",
              notes: initial.notes ?? "",
            }
          : PROP_FORM_DEFAULT,
      );
    }, [initial, open]);

    const updateDraft = (values: Partial<PropPayload>) =>
      setDraft((current) => ({ ...current, ...values }));

    return {
      close: () => onOpenChange(false),
      draft,
      initial,
      onOpenChange,
      open,
      project,
      propTypeValues: PROP_TYPE_VALUES,
      references,
      saveDisabled: saving || !draft.name.trim(),
      saving,
      submit: () => void onSubmit(draft),
      title: initial
        ? t("assets.props.editProp")
        : t("assets.props.newProp"),
      updateDraft,
    };
  };
}

export type PropDialogController = ReturnType<
  ReturnType<typeof createUsePropDialogController>
>;
