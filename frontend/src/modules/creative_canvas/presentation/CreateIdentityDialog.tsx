// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createIdentityAsset,
  listCharacters,
  type Character,
} from "@/modules/asset_world/public";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreateIdentityDialogProps {
  project: string;
  sourceUrl: string;
  previewUrl?: string;
  defaultCharacter?: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const AGE_UNSPECIFIED = "__unspecified__";
const AGE_OPTIONS = [
  { value: AGE_UNSPECIFIED, labelKey: "createIdentity.ageUnspecified" },
  { value: "child", labelKey: "createIdentity.ageChild" },
  { value: "youth", labelKey: "createIdentity.ageYouth" },
  { value: "middle", labelKey: "createIdentity.ageMiddle" },
  { value: "elder", labelKey: "createIdentity.ageElder" },
];

export function CreateIdentityDialog({
  project,
  sourceUrl,
  previewUrl,
  defaultCharacter,
  onClose,
  onSuccess,
}: CreateIdentityDialogProps) {
  const { t } = useTranslation();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [character, setCharacter] = useState(defaultCharacter ?? "");
  const [identityName, setIdentityName] = useState("");
  const [appearanceDetails, setAppearanceDetails] = useState("");
  const [facePrompt, setFacePrompt] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingCharacters(true);
    listCharacters(project)
      .then((items) => {
        if (cancelled) return;
        setCharacters(items);
        if (!character && items.length > 0) {
          setCharacter(items[0].name);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingCharacters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const canSubmit = useMemo(
    () => !!character.trim() && !!identityName.trim() && !submitting,
    [character, identityName, submitting],
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createIdentityAsset(project, {
        source_url: sourceUrl,
        character: character.trim(),
        identity_name: identityName.trim(),
        appearance_details: appearanceDetails.trim(),
        face_prompt: facePrompt.trim(),
        age_group: ageGroup,
      });
      onSuccess(t("createIdentity.created", {
        character: result.character,
        identity: result.identity_name,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6">
      <div className="w-full max-w-2xl rounded-xl border border-border-default bg-surface shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text">{t("createIdentity.title")}</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {t("createIdentity.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 grid grid-cols-[180px_1fr] gap-4">
          <div className="rounded-lg border border-border-default bg-bg-dark p-2">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={t("createIdentity.sourceImageAlt")}
                className="w-full rounded object-contain max-h-56"
              />
            ) : (
              <div className="h-40 flex items-center justify-center text-xs text-text-muted">
                {t("createIdentity.noPreview")}
              </div>
            )}
            <div className="text-[11px] text-text-muted mt-2 break-all">
              {t("createIdentity.source")}: {sourceUrl}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-text-muted">{t("createIdentity.character")}</span>
              <Select
                value={character || null}
                onValueChange={(value) => {
                  if (value) setCharacter(value);
                }}
                disabled={loadingCharacters}
              >
                <SelectTrigger className="mt-1 w-full bg-bg-dark text-sm text-text">
                  <SelectValue placeholder={t("createIdentity.characterPlaceholder")} />
                </SelectTrigger>
                <SelectContent align="start">
                  {characters.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      {item.display_name || item.name}
                    </SelectItem>
                  ))}
                  {character && !characters.some((item) => item.name === character) && (
                    <SelectItem value={character}>{character}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </label>

            <label className="block">
              <span className="text-xs text-text-muted">{t("createIdentity.identityName")}</span>
              <input
                value={identityName}
                onChange={(e) => setIdentityName(e.target.value)}
                placeholder={t("createIdentity.identityNamePlaceholder")}
                className="mt-1 w-full rounded-md border border-border-default bg-bg-dark px-3 py-2 text-sm text-text"
              />
            </label>

            <label className="block">
              <span className="text-xs text-text-muted">{t("createIdentity.ageGroup")}</span>
              <Select
                value={ageGroup || AGE_UNSPECIFIED}
                onValueChange={(value) => {
                  if (value) setAgeGroup(value === AGE_UNSPECIFIED ? "" : value);
                }}
              >
                <SelectTrigger className="mt-1 w-full bg-bg-dark text-sm text-text">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {AGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block">
              <span className="text-xs text-text-muted">{t("createIdentity.appearanceDetails")}</span>
              <textarea
                value={appearanceDetails}
                onChange={(e) => setAppearanceDetails(e.target.value)}
                rows={3}
                placeholder={t("createIdentity.appearancePlaceholder")}
                className="mt-1 w-full rounded-md border border-border-default bg-bg-dark px-3 py-2 text-sm text-text"
              />
            </label>

            <label className="block">
              <span className="text-xs text-text-muted">{t("createIdentity.facePrompt")}</span>
              <textarea
                value={facePrompt}
                onChange={(e) => setFacePrompt(e.target.value)}
                rows={2}
                placeholder={t("createIdentity.facePromptPlaceholder")}
                className="mt-1 w-full rounded-md border border-border-default bg-bg-dark px-3 py-2 text-sm text-text"
              />
            </label>

            {error && (
              <div className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border-default flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-border-default text-xs text-text-muted hover:text-text"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t("createIdentity.creating") : t("createIdentity.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
