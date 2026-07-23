// Copyright (c) 2026 AI anime
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import type { CharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";

const addCharacterSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  gender: z.string().optional(),
  description: z.string().optional(),
  face_prompt: z.string().optional(),
});

type AddCharacterForm = z.infer<typeof addCharacterSchema>;

export interface AddCharacterControllerOptions {
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
}

export function createUseAddCharacterController(
  queries: CharacterQueryHooks,
) {
  return function useAddCharacterController(
    options: AddCharacterControllerOptions,
  ) {
    const { onOpenChange, open, project } = options;
    const { t } = useTranslation();
    const createCharacter = queries.useCreateCharacter(project);
    const { register, handleSubmit, reset, setValue, watch } =
      useForm<AddCharacterForm>({
        resolver: zodResolver(addCharacterSchema),
      });

    const submit = handleSubmit(async (data) => {
      try {
        await createCharacter.mutateAsync(data);
        reset();
        onOpenChange(false);
        toast.success(t("characters.toasts.created"));
      } catch {
        toast.error(t("common.error"));
      }
    });

    return {
      createPending: createCharacter.isPending,
      gender: watch("gender") ?? "",
      onOpenChange,
      open,
      register,
      role: watch("role") ?? "",
      setGender: (value: string) =>
        setValue("gender", value, { shouldDirty: true }),
      setRole: (value: string) =>
        setValue("role", value, { shouldDirty: true }),
      submit,
    };
  };
}

export type AddCharacterController = ReturnType<
  ReturnType<typeof createUseAddCharacterController>
>;
