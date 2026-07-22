// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save, Sparkles } from "lucide-react";
import { CreditCostInline } from "@/components/credit-cost-inline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCharacterIdentities } from "@/lib/queries/characters";
import { cn } from "@/lib/utils";
import type { Character, Identity } from "@/types/character";

type DefaultIdentityMap = Record<string, string>;

function sanitizeDefaultMap(
  selected: string[],
  defaultMap: DefaultIdentityMap,
): DefaultIdentityMap {
  const selectedSet = new Set(selected);
  return Object.fromEntries(
    Object.entries(defaultMap).filter(([, identityId]) =>
      selectedSet.has(identityId),
    ),
  );
}

function firstSelectedIdentity(
  identities: Identity[],
  selected: string[],
): string | undefined {
  return identities.find((identity) => selected.includes(identity.identity_id))
    ?.identity_id;
}

function CharacterIdentityGroup({
  project,
  character,
  selected,
  defaultIdentityId,
  onToggle,
  onDefaultChange,
}: {
  project: string;
  character: Character;
  selected: string[];
  defaultIdentityId?: string;
  onToggle: (characterName: string, id: string, identities: Identity[]) => void;
  onDefaultChange: (characterName: string, id: string) => void;
}) {
  const { t } = useTranslation();
  const { data: identitiesRes } = useCharacterIdentities(project, character.name);
  const identities: Identity[] = identitiesRes?.data ?? [];
  if (identities.length === 0) return null;

  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {character.name}
      </p>
      <div className="flex flex-wrap gap-2">
        {identities.map((identity) => {
          const isSelected = selected.includes(identity.identity_id);
          return (
            <div
              key={identity.identity_id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-[8px] border px-2.5 py-1.5 text-xs transition-colors",
                isSelected
                  ? "border-primary/65 bg-primary/10 text-foreground"
                  : "border-border bg-muted text-muted-foreground hover:border-foreground/25 hover:bg-accent hover:text-foreground",
              )}
            >
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isSelected}
                  onChange={() =>
                    onToggle(character.name, identity.identity_id, identities)
                  }
                />
                {identity.identity_name}
              </label>
              {isSelected ? (
                <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
                  <input
                    type="radio"
                    name={`default-identity-${character.name}`}
                    checked={defaultIdentityId === identity.identity_id}
                    onChange={() =>
                      onDefaultChange(character.name, identity.identity_id)
                    }
                    aria-label={`${identity.identity_name} ${t(
                      "identityPicker.defaultIdentity",
                    )}`}
                  />
                  {t("identityPicker.defaultIdentity")}
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function IdentityPickerDialog({
  open,
  onOpenChange,
  project,
  characters,
  selected,
  defaultMap = {},
  onChange,
  onPlan,
  planPending,
  planCostDisplay,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: string;
  characters: Character[];
  selected: string[];
  defaultMap?: DefaultIdentityMap;
  onChange: (next: string[], defaultMap: DefaultIdentityMap) => void;
  onPlan: () => void;
  planPending: boolean;
  planCostDisplay?: string | null;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<{
    selected: string[];
    defaultMap: DefaultIdentityMap;
  }>({ selected, defaultMap });
  useEffect(() => {
    if (open) setDraft({ selected, defaultMap });
  }, [defaultMap, open, selected]);

  const toggle = (characterName: string, id: string, identities: Identity[]) =>
    setDraft((prev) => {
      const isSelected = prev.selected.includes(id);
      const nextSelected = isSelected
        ? prev.selected.filter((x) => x !== id)
        : [...prev.selected, id];
      const nextDefaultMap = { ...prev.defaultMap };

      if (isSelected && nextDefaultMap[characterName] === id) {
        const fallback = firstSelectedIdentity(identities, nextSelected);
        if (fallback) nextDefaultMap[characterName] = fallback;
        else delete nextDefaultMap[characterName];
      } else if (
        !isSelected &&
        (!nextDefaultMap[characterName] ||
          !nextSelected.includes(nextDefaultMap[characterName]))
      ) {
        nextDefaultMap[characterName] = id;
      }

      return {
        selected: nextSelected,
        defaultMap: nextDefaultMap,
      };
    });

  const setDefaultIdentity = (characterName: string, id: string) =>
    setDraft((prev) => {
      if (!prev.selected.includes(id)) return prev;
      return {
        ...prev,
        defaultMap: {
          ...prev.defaultMap,
          [characterName]: id,
        },
      };
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/8 supports-backdrop-filter:backdrop-blur-sm"
        className="gap-4 overflow-hidden rounded-2xl border border-border bg-popover p-7 text-popover-foreground shadow-2xl sm:max-w-xl"
      >
        <DialogHeader className="gap-2">
          <DialogTitle className="text-lg font-medium tracking-tight">
            {t("identityPicker.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[56vh] space-y-5 overflow-y-auto pr-1">
          {characters.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("identityPicker.empty")}
            </p>
          ) : (
            characters.map((char) => (
              <CharacterIdentityGroup
                key={char.name}
                project={project}
                character={char}
                selected={draft.selected}
                defaultIdentityId={draft.defaultMap[char.name]}
                onToggle={toggle}
                onDefaultChange={setDefaultIdentity}
              />
            ))
          )}
        </div>
        <DialogFooter className="-mx-7 -mb-7 border-t-0 bg-transparent p-7 pt-4 sm:flex-row sm:items-center sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onPlan}
            disabled={planPending}
            className="mr-auto h-8 gap-1.5 rounded-[8px] border-border bg-muted px-3 text-sm font-normal text-foreground/82 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground [&_svg]:text-foreground/75"
          >
            {planPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {t("identityPicker.aiPlan")}
            <CreditCostInline display={planCostDisplay} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-[8px] px-3 text-sm font-normal text-foreground/75 hover:bg-muted hover:text-foreground"
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onChange(
                draft.selected,
                sanitizeDefaultMap(draft.selected, draft.defaultMap),
              );
              onOpenChange(false);
            }}
            className="h-8 gap-1.5 rounded-[8px] px-3 text-sm font-normal shadow-none"
          >
            <Save className="size-3.5" />
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
