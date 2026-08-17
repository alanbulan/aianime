// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle,
  ExternalLink,
  History,
  ImageIcon,
  Loader2,
  Map,
  Mars,
  Mic2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Shirt,
  Sparkles,
  Sliders,
  Star,
  Trash2,
  Upload,
  Users,
  UserSquare2,
  Venus,
  Waves,
} from "lucide-react";

import type { AddCharacterController } from "@/modules/asset_world/application/use-add-character-controller";
import type { CharacterAssetHistoryController } from "@/modules/asset_world/application/use-character-asset-history-controller";
import type { CharacterDetailController } from "@/modules/asset_world/application/use-character-detail-controller";
import type { CharactersPageController } from "@/modules/asset_world/application/use-characters-page-controller";
import type { IdentitiesGridController } from "@/modules/asset_world/application/use-identities-grid-controller";
import type { IdentityCardController } from "@/modules/asset_world/application/use-identity-card-controller";
import { SlidingTabs } from "@/components/nav/sliding-tabs";
import { CharacterSearch } from "@/components/assets/character-search";
import { CharacterStatsStrip } from "@/components/assets/character-stats-strip";
import { ProjectStyleChip } from "@/modules/asset_world/presentation/ProjectStyleChip";
import { UsageCountBadge } from "@/components/assets/usage-count-badge";
import { CopyAssetLinkButton } from "@/modules/asset_world/presentation/CopyAssetLinkButton";
import { AssetBeatReferences } from "@/components/assets/asset-beat-references";
import { LightboxImage } from "@/components/lightbox-image";
import { CreditCostInline } from "@/components/credit-cost-inline";
import { EMPTY_STATE_ACTION_BUTTON_CLASS } from "@/components/ui/empty-state-styles";
import {
  AssetHeaderActionsSlotProvider,
  AssetHeaderActionsTarget,
} from "@/components/assets/asset-header-actions-slot";
import { resolveMediaUrl } from "@/lib/media-url";
import { getProjectCover } from "@/lib/project-cover";
import { Button } from "@/components/ui/button";
import { SUBTLE_HEADER_ACTION_BUTTON_CLASS } from "@/components/ui/header-action-styles";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SaveStatus } from "@/components/save-status";
import { saveScopes } from "@/shared/stores/save-status-store";
import { SidebarListSkeleton } from "@/components/skeletons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  AssetTab,
  Character,
  CharacterMainCopy,
  Identity,
} from "@/modules/asset_world/domain/character";

// ─── constants ───────────────────────────────────────────────────────────────

const AGE_GROUP_OPTIONS = [
  { value: "child", labelKey: "characters.ageGroups.child" },
  { value: "youth", labelKey: "characters.ageGroups.young" },
  { value: "middle", labelKey: "characters.ageGroups.middle" },
  { value: "elder", labelKey: "characters.ageGroups.elder" },
] as const;

const GENDER_OPTIONS = [
  { value: "男", labelKey: "characters.genders.male" },
  { value: "女", labelKey: "characters.genders.female" },
] as const;

const ROLE_OPTIONS = [
  { value: "主角", labelKey: "characters.roles.lead" },
  { value: "配角", labelKey: "characters.roles.supporting" },
  { value: "反派", labelKey: "characters.roles.villain" },
] as const;

const ATTEMPT_WARN_THRESHOLD = 3;
const CHARACTER_SELECT_CONTENT_CLASS =
  "rounded-md border border-border bg-popover p-1 shadow-xl data-[align-trigger=true]:animate-in [&_[data-slot=select-item]]:min-h-8 [&_[data-slot=select-item]]:rounded-sm [&_[data-slot=select-item]]:px-2 [&_[data-slot=select-item]]:py-1.5 [&_[data-slot=select-item]]:text-xs [&_[data-slot=select-item]:focus]:bg-muted [&_[data-slot=select-item]:focus]:text-current [&_[data-slot=select-item]_svg]:size-3.5";
const CHARACTER_INPUT_CLASS =
  "!h-9 rounded-[8px] border-border bg-muted px-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";
const CHARACTER_TEXTAREA_CLASS =
  "w-full resize-none rounded-[8px] border border-border bg-muted p-2.5 text-sm leading-relaxed shadow-none placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10";
const CHARACTER_SELECT_TRIGGER_CLASS =
  "!h-9 w-full rounded-[8px] border-border bg-muted px-3 text-sm shadow-none focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";
const CHARACTER_DIALOG_CONTENT_CLASS =
  "gap-4 overflow-hidden rounded-2xl border border-border bg-popover/95 p-7 shadow-xl backdrop-blur-3xl";
const CHARACTER_DIALOG_FOOTER_CLASS =
  "-mx-7 -mb-7 border-t-0 bg-transparent p-7 pt-3 sm:flex-row sm:justify-end";
const CHARACTER_DIALOG_CANCEL_BUTTON_CLASS =
  "h-10 w-18 rounded-md border-border bg-muted px-0 text-sm font-normal text-foreground/80 hover:border-foreground/30 hover:bg-accent hover:text-foreground";
const CHARACTER_DIALOG_ACTION_BUTTON_CLASS =
  "h-10 w-18 rounded-md bg-primary px-0 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90";

// ─── helpers ─────────────────────────────────────────────────────────────────

function labelKeyFor<T extends { value: string; labelKey: string }>(
  opts: readonly T[],
  value: string | undefined,
): string | undefined {
  return opts.find((o) => o.value === value)?.labelKey;
}


export function CharacterAssetHistoryButtonView({
  controller,
  disabled,
  className,
  iconOnly = false,
}: {
  controller: CharacterAssetHistoryController;
  disabled?: boolean;
  className?: string;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const {
    apiError,
    available,
    currentUrl,
    entries,
    isFetching,
    isLoading,
    open,
    refresh,
    restore,
    restoringHistoryId,
    restorePending,
    setOpen,
  } = controller;

  if (!available) return null;

  return (
    <>
      <Button
        type="button"
        size={iconOnly ? "icon-xs" : "sm"}
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={t("characters.history.open")}
        data-ui-tooltip={t("characters.history.open")}
        className={cn(
          iconOnly
            ? "size-6 rounded-[4px] border-media-foreground/10 bg-media/45 p-0 text-media-foreground/80 shadow-none hover:bg-media/60"
            : "h-7 gap-1 rounded-[8px] px-2 text-xs",
          className,
        )}
      >
        <History className="size-3" />
        {iconOnly ? (
          <span className="sr-only">{t("characters.history.open")}</span>
        ) : (
          t("characters.history.short")
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(CHARACTER_DIALOG_CONTENT_CLASS, "sm:max-w-3xl")}
        >
          <DialogHeader className="gap-2">
            <DialogTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
              <History className="size-4" />
              {t("characters.history.title")}
            </DialogTitle>
            <DialogDescription>
              {t("characters.history.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {t("characters.history.current")}
              </Label>
              {currentUrl ? (
                <LightboxImage
                  src={resolveMediaUrl(currentUrl) ?? ""}
                  alt={t("characters.history.current")}
                  className="aspect-square w-full rounded-[8px] bg-muted"
                  fit="contain"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-[8px] border border-dashed border-border bg-muted">
                  <ImageIcon className="size-8 text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">
                  {t("characters.history.entries")}
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void refresh()}
                  disabled={isFetching}
                  className="h-7 gap-1 rounded-[8px] px-2 text-xs"
                >
                  {isFetching ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  {t("characters.history.refresh")}
                </Button>
              </div>

              {isLoading ? (
                <div className="flex h-40 items-center justify-center rounded-[8px] border border-border bg-muted text-xs text-muted-foreground">
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : apiError ? (
                <div className="rounded-[8px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {apiError}
                </div>
              ) : entries.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-[8px] border border-dashed border-border bg-muted text-xs text-muted-foreground">
                  {t("characters.history.empty")}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {entries.map((entry) => {
                    const restoring =
                      restoringHistoryId === entry.history_id;
                    return (
                      <div
                        key={entry.history_id}
                        className="rounded-[8px] border border-border bg-muted p-2"
                      >
                        <LightboxImage
                          src={resolveMediaUrl(entry.url) ?? ""}
                          alt={entry.filename}
                          className="aspect-square w-full rounded-[6px] bg-media/10"
                          fit="contain"
                        />
                        <div className="mt-2 min-w-0 space-y-1">
                          <p className="truncate text-xs font-medium">
                            {entry.filename}
                          </p>
                          {(entry.createdAtLabel || entry.sizeLabel) && (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {[entry.createdAtLabel, entry.sizeLabel]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void restore(entry)}
                            disabled={restorePending}
                            className="mt-1 h-7 w-full gap-1 rounded-[8px] px-2 text-xs"
                          >
                            {restoring ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <RotateCcw className="size-3" />
                            )}
                            {restoring
                              ? t("characters.history.restoring")
                              : t("characters.history.restore")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CharacterAvatar({
  character,
  size = "md",
}: {
  character: Character;
  size?: "sm" | "md" | "lg";
}) {
  const { gradient, initial } = useMemo(
    () => getProjectCover(character.name),
    [character.name],
  );
  const dim = size === "lg" ? "size-16" : size === "sm" ? "size-9" : "size-10";
  const textSize = size === "lg" ? "text-xl" : "text-sm";
  if (character.portrait_url) {
    return (
      <img
        src={resolveMediaUrl(character.portrait_url) ?? ""}
        alt={character.name}
        loading="lazy"
        decoding="async"
        className={cn(
          "shrink-0 rounded-full border border-border object-cover",
          dim,
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white/95",
        dim,
        textSize,
      )}
      style={{ background: gradient }}
    >
      {initial}
    </span>
  );
}

// ─── Top bar (spans full width) ──────────────────────────────────────────────

function CharactersPageHeader({
  onRebuild,
  rebuildDisabled,
  buildCharactersCostDisplay,
  onAdd,
  project,
  activeTab,
  imageSourceControl,
}: {
  onRebuild: () => void;
  rebuildDisabled: boolean;
  buildCharactersCostDisplay?: string | null;
  onAdd: () => void;
  project: string;
  activeTab: AssetTab;
  imageSourceControl: ReactNode;
}) {
  const { t } = useTranslation();
  const isCharactersTab = activeTab === "characters";

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-9 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Waves className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {t("nav.assets")}
            </h1>
            <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {t(`characters.assetTabs.${activeTab}`)}
            </span>
            {isCharactersTab && <ProjectStyleChip project={project} />}
            {isCharactersTab && (
              <SaveStatus
                scope={saveScopes.charactersPage(project)}
                variant="header"
              />
            )}
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t(`characters.assetSubtitles.${activeTab}`)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
        {isCharactersTab && (
          <>
            {imageSourceControl}
            <Button
              variant="outline"
              size="sm"
              onClick={onAdd}
              className={SUBTLE_HEADER_ACTION_BUTTON_CLASS}
            >
              <Plus className="size-3.5" />
              {t("characters.addCharacter")}
            </Button>
            <Button
              size="sm"
              onClick={onRebuild}
              disabled={rebuildDisabled}
              className="h-8 gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75"
            >
              <RefreshCw className="size-3.5" />
              {t("characters.autoExtract")}
              <CreditCostInline
                display={buildCharactersCostDisplay}
                className="text-primary-foreground"
                iconClassName="text-primary-foreground drop-shadow-none [&_path]:fill-current"
              />
            </Button>
          </>
        )}
        <AssetHeaderActionsTarget className="contents" />
      </div>
    </div>
  );
}

function AssetTabs({
  value,
  onChange,
}: {
  value: AssetTab;
  onChange: (value: AssetTab) => void;
}) {
  const { t } = useTranslation();
  const tabs: { value: AssetTab; icon: React.ElementType }[] = [
    { value: "characters", icon: Users },
    { value: "scenes", icon: Map },
    { value: "props", icon: Package },
    { value: "voices", icon: Mic2 },
  ];

  return (
    <div className="flex shrink-0 justify-center border-b border-border bg-background px-9 py-3">
      <SlidingTabs
        items={tabs.map(({ value: tab, icon }) => ({
          value: tab,
          icon,
          label: t(`characters.assetTabs.${tab}`),
        }))}
        value={value}
        onValueChange={onChange}
        aria-label={t("nav.assets")}
      />
    </div>
  );
}

// ─── Middle: Character list item ─────────────────────────────────────────────

function CharacterListItem({
  character,
  selected,
  onSelect,
  mainCharacterLabel,
}: {
  character: Character;
  selected: boolean;
  onSelect: () => void;
  mainCharacterLabel: string;
}) {
  const { t } = useTranslation();
  const ageKey = labelKeyFor(AGE_GROUP_OPTIONS, character.age_group);
  const metaParts = [
    ageKey ? t(ageKey) : undefined,
    character.gender || undefined,
    character.body_type || undefined,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[8px] border px-2.5 py-2 text-left transition-colors",
        "hover:border-foreground/25 hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary/50 bg-primary/[0.035]"
          : "border-transparent bg-transparent",
      )}
    >
      <CharacterAvatar character={character} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-foreground">
            {character.name}
          </span>
          {character.is_main && (
            <span
              className="inline-flex items-center gap-0.5 text-xs font-medium text-primary"
              data-ui-tooltip={mainCharacterLabel}
            >
              <Star className="size-3.5 fill-current" />
            </span>
          )}
        </div>
        {metaParts.length > 0 && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {metaParts.join(" · ")}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Right detail: SECTIONS (all flat, no tabs) ──────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <Label className="text-xs font-medium leading-4 text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && (
        <p className="-mt-0.5 text-xs leading-4 text-muted-foreground/70">
          {hint}
        </p>
      )}
    </div>
  );
}

// Full-width header: gender + name + role chip + toggle-main + delete
function CharacterHeaderRow({
  controller,
}: {
  controller: CharacterDetailController;
}) {
  const { t } = useTranslation();
  const { character, detailsScope } = controller;
  const {
    confirmDelete,
    deleteOpen,
    deletePending,
    freezonePending,
    mainCopy,
    openFreezone,
    setDeleteOpen,
    toggleMain,
    updatePending,
  } = controller.header;
  const roleLabel = character.role ?? "";

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
        {character.gender === "男" && (
          <Mars className="size-4 text-sky-700 dark:text-sky-300" aria-hidden />
        )}
        {character.gender === "女" && (
          <Venus className="size-4 text-pink-700 dark:text-pink-300" aria-hidden />
        )}
        <h2 className="truncate text-[19px] font-semibold tracking-tight text-foreground">
          {character.name}
        </h2>
        {(roleLabel || character.is_main) && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              character.is_main
                ? "border border-warning/40 bg-warning/15 text-warning"
                : "border border-border bg-muted text-muted-foreground",
            )}
          >
            {character.is_main && <Star className="size-2.5 fill-current" />}
            {character.is_main ? mainCopy.label : roleLabel}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="flex h-8 min-w-[112px] items-center justify-end">
          <SaveStatus scope={detailsScope} variant="inline" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void openFreezone()}
          disabled={freezonePending}
          className="gap-1.5 rounded-[8px] border border-border bg-muted text-foreground shadow-none transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground disabled:border-transparent disabled:bg-transparent disabled:text-muted-foreground disabled:hover:border-transparent disabled:hover:bg-transparent"
          data-ui-tooltip={t("characters.freezone.openCharacterTip")}
        >
          {freezonePending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ExternalLink className="size-3.5" />
          )}
          {t("characters.freezone.openCharacter")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void toggleMain()}
          disabled={updatePending}
          className={cn("gap-1.5", character.is_main && "text-primary")}
        >
          <Star
            className={cn("size-3.5", character.is_main && "fill-current")}
          />
          {character.is_main ? mainCopy.unsetMain : mainCopy.makeMain}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDeleteOpen(true)}
          disabled={deletePending}
          aria-label={t("characters.drawer.deleteChar")}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("characters.drawer.deleteChar")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("characters.confirm.delete", { name: character.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmDelete()}
            >
              {deletePending && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Portrait block — image + generate/upload actions + attempt state
function PortraitBlock({
  controller,
  historyContent,
}: {
  controller: CharacterDetailController;
  historyContent: ReactNode;
}) {
  const { t } = useTranslation();
  const { character } = controller;
  const {
    attemptCount,
    costDisplay,
    generate,
    generateBusy,
    generateConfirmOpen,
    inputRef,
    setGenerateConfirmOpen,
    upload,
    uploadPending,
  } = controller.portrait;

  return (
    <div className="flex w-full flex-col items-start gap-2">
      {character.portrait_url ? (
        <LightboxImage
          src={resolveMediaUrl(character.portrait_url) ?? ""}
          alt={character.name}
          className="aspect-square w-full max-w-[180px] rounded-[8px]"
        />
      ) : (
        <div className="flex aspect-square w-full max-w-[180px] items-center justify-center rounded-[8px] border border-dashed border-border bg-muted">
          <ImageIcon className="size-10 text-muted-foreground" />
        </div>
      )}
      <div className="flex w-full max-w-[180px] flex-col gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setGenerateConfirmOpen(true)}
          disabled={generateBusy}
          className="relative h-7 w-full gap-1 rounded-[8px] px-2 text-xs"
        >
          {generateBusy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Sparkles className="size-3" />
          )}
          {character.portrait_url
            ? t("characters.portrait.regenerate")
            : t("characters.summary.generateNew")}
          <CreditCostInline display={costDisplay} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploadPending}
          className="h-7 w-full gap-1 rounded-[8px] px-2 text-xs"
        >
          <Upload className="size-3" />
          {t("characters.summary.uploadImage")}
        </Button>
        {historyContent}
      </div>
      {attemptCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("characters.portrait.attemptsBadge", { count: attemptCount })}
        </p>
      )}
      {attemptCount >= ATTEMPT_WARN_THRESHOLD && (
        <div className="flex w-full items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("characters.portrait.attemptsWarning")}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void upload(file);
          }
          e.target.value = "";
        }}
      />
      <AlertDialog
        open={generateConfirmOpen}
        onOpenChange={setGenerateConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("characters.generatePortraitTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("characters.generatePortraitDesc")}
              {character.portrait_url
                ? t("characters.generatePortraitReplace")
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setGenerateConfirmOpen(false);
                void generate();
              }}
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Details form card — all editable fields with a single explicit save
function DetailsFormCard({
  controller,
}: {
  controller: CharacterDetailController;
}) {
  const { t } = useTranslation();
  const { character } = controller;
  const {
    aliases,
    bodyType,
    description,
    displayName,
    facePrompt,
    handleBlurAliases,
    handleBlurBodyType,
    handleBlurDescription,
    handleBlurFacePrompt,
    handleBlurName,
    handleBlurRole,
    handleInstantSelect,
    role,
    setAliases,
    setBodyType,
    setDescription,
    setDisplayName,
    setFacePrompt,
    setRole,
  } = controller.details;

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-1 gap-5 @[900px]:grid-cols-[minmax(200px,0.78fr)_minmax(220px,0.86fr)_minmax(0,1.55fr)]">
        {/* Column 1: base attributes */}
        <div className="space-y-3">
          <Field label={t("characters.basics.name")}>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={() => void handleBlurName()}
              className={CHARACTER_INPUT_CLASS}
            />
          </Field>
          <Field label={t("characters.basics.role")}>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onBlur={handleBlurRole}
              placeholder={t("characters.rolePlaceholder")}
              className={CHARACTER_INPUT_CLASS}
            />
          </Field>
          <Field label={t("characters.basics.gender")}>
            <Select
              value={character.gender ?? ""}
              onValueChange={(v) => handleInstantSelect("gender", v)}
            >
              <SelectTrigger className={CHARACTER_SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder={t("ingest.selectPlaceholder")}>
                  {(val: string) => {
                    const key = labelKeyFor(GENDER_OPTIONS, val);
                    return key ? t(key) : val;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                alignItemWithTrigger={false}
                sideOffset={8}
                className={CHARACTER_SELECT_CONTENT_CLASS}
              >
                {GENDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Column 2: aliases + age/body */}
        <div className="space-y-3">
          <Field label={t("characters.basics.aliases")}>
            <Input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              onBlur={handleBlurAliases}
              placeholder={`${t("characters.aliasesPlaceholder")}，${t(
                "characters.basics.aliasesHint",
              )}`}
              className={CHARACTER_INPUT_CLASS}
            />
          </Field>
          <Field label={t("characters.basics.ageGroup")}>
            <Select
              value={character.age_group ?? ""}
              onValueChange={(v) => handleInstantSelect("age_group", v)}
            >
              <SelectTrigger className={CHARACTER_SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder={t("ingest.selectPlaceholder")}>
                  {(val: string) => {
                    const key = labelKeyFor(AGE_GROUP_OPTIONS, val);
                    return key ? t(key) : val;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                alignItemWithTrigger={false}
                sideOffset={8}
                className={CHARACTER_SELECT_CONTENT_CLASS}
              >
                {AGE_GROUP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("characters.basics.bodyType")}>
            <Input
              value={bodyType}
              onChange={(e) => setBodyType(e.target.value)}
              onBlur={handleBlurBodyType}
              placeholder={t("characters.bodyTypePlaceholder")}
              className={CHARACTER_INPUT_CLASS}
            />
          </Field>
        </div>

        {/* Column 3: prompts */}
        <div className="min-w-0 space-y-3">
          <Field label={t("characters.basics.description")}>
            <textarea
              className={cn(CHARACTER_TEXTAREA_CLASS, "min-h-[96px]")}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleBlurDescription}
            />
          </Field>
          <Field label={t("characters.basics.facePrompt")}>
            <textarea
              className={cn(CHARACTER_TEXTAREA_CLASS, "min-h-[96px]")}
              rows={3}
              value={facePrompt}
              onChange={(e) => setFacePrompt(e.target.value)}
              onBlur={handleBlurFacePrompt}
              placeholder="oval face, big eyes…"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// Identity card — two image slots (body + costume) with full action set
export function IdentityCardView({
  controller,
  costumeHistory,
  imageHistory,
  portraitHistory,
}: {
  controller: IdentityCardController;
  costumeHistory: ReactNode;
  imageHistory: ReactNode;
  portraitHistory: ReactNode;
}) {
  const { t } = useTranslation();
  const {
    ageLabel,
    appearance,
    appearanceDirty,
    bodyType,
    changeAgeGroup: handleAgeGroupChange,
    confirmDelete,
    costumeInputRef,
    deleteCostumePending,
    deleteImageOpen,
    deleteImagePending,
    deleteOpen,
    deletePending,
    facePrompt,
    generateImageBusy,
    generateImageOpen: confirmGenOpen,
    generatePortraitBusy,
    generatePortraitOpen: confirmGenPortraitOpen,
    identity,
    identityAge,
    identityCostDisplay: identityCost,
    imageAttempts,
    imageInputRef,
    isAgeVariant,
    portraitAttempts,
    portraitInputRef,
    project,
    referenceCount,
    references,
    referencesDirty: refsDirty,
    removeCostume: handleDeleteCostume,
    removeImage: handleDeleteImage,
    rename: handleRename,
    renameOpen,
    renameValue,
    requestGeneratePortrait: handleGenPortrait,
    requestPortraitUpload,
    roleLabel,
    runGenerateImage: runGenImage,
    runGeneratePortrait: runGenPortrait,
    saveAppearance: handleSaveAppearance,
    saveReferences: handleSaveRefs,
    setAppearance,
    setBodyType,
    setDeleteImageOpen,
    setDeleteOpen,
    setFacePrompt,
    setGenerateImageOpen: setConfirmGenOpen,
    setGeneratePortraitOpen: setConfirmGenPortraitOpen,
    setRenameOpen,
    setRenameValue,
    showCreditDecorations,
    updatePending,
    upload,
    uploadCostumePending,
    uploadPortraitPending,
  } = controller;
  const identityCreditButtonClass = showCreditDecorations
    ? "relative h-7 gap-1 rounded-[8px] px-2 pr-9 text-xs transition-transform active:scale-95"
    : "h-7 gap-1 rounded-[8px] px-2 text-xs transition-transform active:scale-95";
  const identityCreditDialogActionClass = showCreditDecorations
    ? "relative border-[3px] border-primary bg-transparent pr-9 transition-transform hover:border-primary hover:bg-transparent active:scale-95"
    : "transition-transform active:scale-95";

  return (
    <article className="@container flex flex-col gap-4 rounded-[10px] border border-border bg-card p-5 pb-3">
      {/* Header: name + chips + delete */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
          <h4 className="truncate text-sm font-semibold text-foreground">
            {identity.identity_name}
          </h4>
          <code className="truncate rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {identity.identity_id}
          </code>
          {isAgeVariant && (
            <span className="inline-flex items-center rounded-[6px] border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-xs text-warning">
              {(() => {
                const lk = labelKeyFor(AGE_GROUP_OPTIONS, identityAge);
                return lk ? t(lk) : identityAge;
              })()}
              {t("characters.identities.variantSuffix")}
            </span>
          )}
          {roleLabel && !isAgeVariant && (
            <span className="inline-flex items-center rounded-[6px] border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-xs text-warning">
              {roleLabel}
            </span>
          )}
          {!isAgeVariant && !roleLabel && ageLabel && (
            <span className="inline-flex items-center rounded-[6px] border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {ageLabel}
            </span>
          )}
          <UsageCountBadge count={referenceCount} />
        </div>
        <CopyAssetLinkButton type="identity" id={identity.identity_id} />
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setRenameOpen(true)}
          aria-label={t("characters.identities.renameIdentity")}
          className="text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </Button>
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("characters.identities.deleteIdentity")}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("characters.identities.deleteIdentity")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("characters.confirm.deleteIdentity", {
                  name: identity.identity_name,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void confirmDelete()}
                disabled={deletePending}
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Hero row: identity image (left) + appearance editor (right) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)]">
        {/* Identity image preview */}
        <div className="relative">
          {identity.image_url ? (
            <LightboxImage
              src={resolveMediaUrl(identity.image_url) ?? ""}
              alt={identity.identity_name}
              className="aspect-[4/3] w-full rounded-[8px] bg-muted"
              fit="contain"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-border bg-muted text-muted-foreground">
              <UserSquare2 className="size-8" />
              <span className="text-xs">
                {t("characters.identities.heroEmpty")}
              </span>
            </div>
          )}
          {identity.image_url && (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); setDeleteImageOpen(true); }}
              disabled={deleteImagePending}
              aria-label={t("characters.identities.deleteImage")}
              className="absolute right-1.5 top-1.5 z-20 size-6 rounded-[4px] bg-media/50 p-0 text-media-foreground/70 backdrop-blur-sm hover:bg-destructive/30 hover:text-destructive"
            >
              {deleteImagePending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Trash2 className="size-3" />
              )}
            </Button>
          )}
        </div>

        {/* Appearance editor + primary actions */}
        <div className="flex min-w-0 flex-col gap-2.5">
          <Label className="flex items-center gap-1 text-xs font-medium leading-4 text-muted-foreground">
            {t("characters.identities.appearanceHeading")}
          </Label>
          <textarea
            className={cn(CHARACTER_TEXTAREA_CLASS, "min-h-[84px] flex-1")}
            value={appearance}
            onChange={(e) => setAppearance(e.target.value)}
            placeholder={t("characters.identities.appearancePlaceholder")}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className={identityCreditButtonClass}
              onClick={() => setConfirmGenOpen(true)}
              disabled={generateImageBusy || !appearance.trim()}
            >
              {generateImageBusy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              {identity.image_url
                ? t("characters.identities.regenerate")
                : t("characters.identities.generate")}
              <CreditCostInline display={identityCost} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 rounded-[8px] px-2 text-xs"
              onClick={() => imageInputRef.current?.click()}
            >
              <Upload className="size-3" />
              {t("characters.identities.upload")}
            </Button>
            {imageHistory}
            {identity.image_url && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-[8px] px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteImageOpen(true)}
                disabled={deleteImagePending}
              >
                {deleteImagePending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                {t("characters.identities.deleteImage")}
              </Button>
            )}
            {appearanceDirty && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 gap-1 rounded-[8px] px-2 text-xs"
                onClick={() => void handleSaveAppearance()}
                disabled={updatePending}
              >
                {updatePending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Save className="size-3" />
                )}
                {t("characters.identities.saveAppearance")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Refs: costume reference + age variant fields (always visible) */}
      <div className="border-t border-border pt-4">
        <div className="mb-4 flex items-center gap-2 text-xs font-medium leading-4 text-muted-foreground">
          <Sliders className="size-3" />
          {t("characters.identities.refsTitle")}
        </div>
        <div className="grid grid-cols-1 gap-5">
          {/* Costume reference */}
          <div className="grid grid-cols-[64px_1fr] gap-3">
            <div className="relative flex flex-col">
              {identity.costume_image_url ? (
                <>
                  <LightboxImage
                    src={resolveMediaUrl(identity.costume_image_url) ?? ""}
                    alt={`${identity.identity_name} ${t("characters.costumeAlt")}`}
                    className="aspect-square w-16 rounded-[8px]"
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteCostume();
                    }}
                    disabled={deleteCostumePending || uploadCostumePending}
                    aria-label={t("characters.identities.deleteCostume")}
                    className="absolute right-1 top-1 z-20 size-5 rounded-[4px] bg-media/50 p-0 text-media-foreground/70 backdrop-blur-sm hover:bg-destructive/30 hover:text-destructive"
                  >
                    {deleteCostumePending ? (
                      <Loader2 className="size-2.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-2.5" />
                    )}
                  </Button>
                </>
              ) : (
                <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-border bg-muted">
                  <Shirt className="size-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {t("characters.identities.costumeRef")}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center gap-1">
              <Label className="text-xs font-medium leading-4 text-muted-foreground">
                {t("characters.identities.costumeRef")}
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground/70">
                {t("characters.identities.costumeRefHint")}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-fit gap-1 rounded-[8px] border-border bg-transparent px-2 text-xs font-normal shadow-none hover:bg-muted"
                  onClick={() => costumeInputRef.current?.click()}
                  disabled={uploadCostumePending || deleteCostumePending}
                >
                  {uploadCostumePending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Upload className="size-3" />
                  )}
                  {identity.costume_image_url
                    ? t("characters.identities.replaceCostume")
                    : t("characters.identities.uploadCostume")}
                </Button>
                {costumeHistory}
              </div>
            </div>
          </div>

          {/* Age variant fields */}
          <div className="border-t border-border pt-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium leading-4 text-muted-foreground">
              <UserSquare2 className="size-3" />
              {t("characters.identities.ageVariantTitle")}
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground/70">
              {t("characters.identities.ageVariantHint")}
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("characters.basics.ageGroup")}
                  </Label>
                  <Select
                    value={identityAge || "__none__"}
                    onValueChange={(v) =>
                      handleAgeGroupChange(v === "__none__" ? "" : (v ?? ""))
                    }
                  >
                    <SelectTrigger className={CHARACTER_SELECT_TRIGGER_CLASS}>
                      <SelectValue>
                        {(val: string) =>
                          !val || val === "__none__"
                            ? t("characters.identities.inheritFromCharacter")
                            : (() => {
                                const lk = labelKeyFor(
                                  AGE_GROUP_OPTIONS,
                                  val,
                                );
                                return lk ? t(lk) : val;
                              })()
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      alignItemWithTrigger={false}
                      sideOffset={8}
                      className={CHARACTER_SELECT_CONTENT_CLASS}
                    >
                      <SelectItem value="__none__">
                        {t("characters.identities.inheritFromCharacter")}
                      </SelectItem>
                      {AGE_GROUP_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {t(o.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("characters.basics.bodyType")}
                  </Label>
                  <Input
                    value={bodyType}
                    onChange={(e) => setBodyType(e.target.value)}
                    onBlur={() => {
                      if (refsDirty) handleSaveRefs();
                    }}
                    className={CHARACTER_INPUT_CLASS}
                    placeholder={t(
                      "characters.identities.bodyTypePlaceholder",
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {t("characters.basics.facePrompt")}
                </Label>
                <textarea
                  className={CHARACTER_TEXTAREA_CLASS}
                  rows={2}
                  value={facePrompt}
                  onChange={(e) => setFacePrompt(e.target.value)}
                  onBlur={() => {
                    if (refsDirty) handleSaveRefs();
                  }}
                  placeholder={t("characters.basics.facePromptHint")}
                />
              </div>

              {/* Identity-level face portrait */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {t("characters.identities.portraitTitle")}
                </Label>
                <div className="grid grid-cols-[56px_1fr] gap-3">
                  {identity.portrait_image_url ? (
                    <LightboxImage
                      src={resolveMediaUrl(identity.portrait_image_url) ?? ""}
                      alt={`${identity.identity_name} portrait`}
                      className="size-14 rounded-[8px]"
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex size-14 items-center justify-center rounded-[8px] border border-dashed border-border bg-muted",
                        !isAgeVariant && "opacity-50",
                      )}
                    >
                      <UserSquare2 className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <TooltipProvider delay={200}>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs leading-snug text-muted-foreground/70">
                        {!isAgeVariant
                          ? t("characters.identities.variantOnly")
                          : identity.portrait_image_url
                            ? t("characters.identities.portraitReady")
                            : facePrompt.trim()
                              ? t("characters.identities.portraitMissing")
                              : t(
                                  "characters.identities.portraitNeedsFacePrompt",
                                )}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="sm"
                                variant="outline"
                                className={identityCreditButtonClass}
                                onClick={handleGenPortrait}
                                disabled={
                                  generatePortraitBusy ||
                                  !isAgeVariant ||
                                  !facePrompt.trim()
                                }
                              >
                                {generatePortraitBusy ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Sparkles className="size-3" />
                                )}
                                {identity.portrait_image_url
                                  ? t("characters.identities.regenerate")
                                  : t("characters.identities.generate")}
                                <CreditCostInline display={identityCost} />
                              </Button>
                            }
                          />
                          <TooltipContent>
                            {!isAgeVariant
                              ? t("characters.identities.variantOnly")
                              : !facePrompt.trim()
                                ? t(
                                    "characters.identities.portraitNeedsFacePrompt",
                                  )
                                : t(
                                    "characters.identities.generatePortraitTip",
                                  )}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 rounded-[8px] px-2 text-xs"
                                onClick={requestPortraitUpload}
                                disabled={
                                  uploadPortraitPending || !isAgeVariant
                                }
                              >
                                {uploadPortraitPending ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Upload className="size-3" />
                                )}
                                {t("characters.identities.upload")}
                              </Button>
                            }
                          />
                          <TooltipContent>
                            {!isAgeVariant
                              ? t("characters.identities.variantOnly")
                              : t("characters.identities.uploadPortraitTip")}
                          </TooltipContent>
                        </Tooltip>
                        {portraitHistory}
                      </div>
                    </div>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void upload("image", file);
          }
          e.target.value = "";
        }}
      />
      <input
        ref={costumeInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void upload("costume", file);
          }
          e.target.value = "";
        }}
      />
      <input
        ref={portraitInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void upload("portrait", file);
          }
          e.target.value = "";
        }}
      />

      {/* Attempt footer (persistent across sessions) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs tabular-nums text-muted-foreground">
        <span
          className={cn(
            imageAttempts >= 5
              ? "text-destructive"
              : imageAttempts >= 3
                ? "text-warning"
                : imageAttempts === 2
                  ? "text-warning"
                  : imageAttempts === 1
                    ? "text-muted-foreground"
                    : "text-muted-foreground",
          )}
        >
          {imageAttempts >= 5
            ? t("characters.identities.attemptsRed", { count: imageAttempts })
            : imageAttempts >= 3
              ? t("characters.identities.attemptsPassword", {
                  count: imageAttempts,
                })
              : imageAttempts === 2
                ? t("characters.identities.attemptsConfirmNext")
                : imageAttempts > 0
                  ? t("characters.identities.attempts", {
                      count: imageAttempts,
                    })
                  : identity.image_url
                    ? t("characters.identities.ready")
                    : t("characters.identities.noAttempts")}
        </span>
        {isAgeVariant && (
          <span className="text-muted-foreground/80">
            · {t("characters.identities.portraitStatus")}:{" "}
            {identity.portrait_image_url
              ? t("characters.identities.portraitReady")
              : t("characters.identities.portraitMissing")}
            {portraitAttempts > 0 &&
              ` (${t("characters.identities.attempts", { count: portraitAttempts })})`}
          </span>
        )}
      </div>

      <AssetBeatReferences
        project={project}
        references={references}
        className="border-t border-border pt-3"
      />

      {/* Dialogs — zero-height wrapper so they don't affect flex gap spacing */}
      <div className="h-0 overflow-hidden" aria-hidden="true">
      {/* Confirm: generate identity image */}
      <AlertDialog open={confirmGenOpen} onOpenChange={setConfirmGenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("characters.identities.confirmGenTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("characters.identities.confirmGenBody", {
                count: imageAttempts + 1,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                setConfirmGenOpen(false);
                runGenImage();
              }}
              className={identityCreditDialogActionClass}
            >
              {t("characters.identities.generate")}
              <CreditCostInline display={identityCost} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: generate portrait */}
      <AlertDialog
        open={confirmGenPortraitOpen}
        onOpenChange={setConfirmGenPortraitOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("characters.identities.confirmGenPortraitTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("characters.identities.confirmGenBody", {
                count: portraitAttempts + 1,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                setConfirmGenPortraitOpen(false);
                runGenPortrait();
              }}
              className={identityCreditDialogActionClass}
            >
              {t("characters.identities.generate")}
              <CreditCostInline display={identityCost} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename identity (编辑 identity_name) */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent
          className={cn(CHARACTER_DIALOG_CONTENT_CLASS, "sm:max-w-md")}
        >
          <DialogHeader className="gap-2">
            <DialogTitle className="text-base font-medium tracking-tight">
              {t("characters.identities.renameIdentity")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("characters.identities.newNamePlaceholder")}
            </Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
              autoFocus
              className={CHARACTER_INPUT_CLASS}
            />
            <p className="text-xs leading-relaxed text-muted-foreground/70">
              {t("characters.identities.renameHint")}
            </p>
            <DialogFooter className={CHARACTER_DIALOG_FOOTER_CLASS}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRenameOpen(false)}
                className={CHARACTER_DIALOG_CANCEL_BUTTON_CLASS}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleRename}
                disabled={
                  updatePending ||
                  !renameValue.trim() ||
                  renameValue.trim() === identity.identity_name
                }
                className={CHARACTER_DIALOG_ACTION_BUTTON_CLASS}
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm: delete generated identity image */}
      <AlertDialog open={deleteImageOpen} onOpenChange={setDeleteImageOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("characters.identities.deleteImage")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("characters.identities.deleteImageBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleDeleteImage()}
              disabled={deleteImagePending}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </article>
  );
}

export function IdentitiesGridSectionView({
  controller,
  renderIdentityCard,
}: {
  controller: IdentitiesGridController;
  renderIdentityCard(identity: Identity): ReactNode;
}) {
  const { t } = useTranslation();
  const {
    add: handleAdd,
    addOpen: addIdentityOpen,
    createPending,
    gridRef,
    identities,
    newAgeGroup,
    newAppearance,
    newName,
    setAddOpen: handleDialogOpenChange,
    setNewAgeGroup,
    setNewAppearance,
    setNewName,
  } = controller;

  return (
    <section className="rounded-[10px] border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shirt className="size-4 text-muted-foreground/80" />
          <h3 className="text-sm font-semibold text-foreground">
            {t("characters.identities.title")}
          </h3>
          <span className="rounded-[6px] bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {identities.length}
          </span>
        </div>
        {identities.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDialogOpenChange(true)}
            className="h-8 gap-1 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none hover:bg-muted"
          >
            <Plus className="size-3.5" />
            {t("characters.identities.addNew")}
          </Button>
        )}
      </div>

      {identities.length === 0 ? (
        <button
          type="button"
          onClick={() => handleDialogOpenChange(true)}
          className="group flex min-h-14 w-full items-center justify-center rounded-[8px] border border-dashed border-border bg-muted px-4 text-center transition hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/72 transition group-hover:text-foreground">
            <Plus className="size-3.5 text-foreground/70 transition group-hover:text-foreground" />
            {t("characters.identities.empty")}
          </span>
        </button>
      ) : (
        <div ref={gridRef} className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {identities.map((id) => (
            <div key={id.identity_id} data-asset-id={id.identity_id}>
              {renderIdentityCard(id)}
            </div>
          ))}
        </div>
      )}

      <Dialog open={addIdentityOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className={cn(CHARACTER_DIALOG_CONTENT_CLASS, "sm:max-w-lg")}
        >
          <DialogHeader className="relative gap-2">
            <DialogTitle className="text-base font-medium tracking-tight">
              {t("characters.identities.addNew")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAdd();
            }}
            className="relative space-y-3.5"
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("characters.identities.name")}
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("characters.identities.newNamePlaceholder")}
                autoFocus
                className={CHARACTER_INPUT_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("characters.basics.ageGroup")}
              </Label>
              <Select
                value={newAgeGroup || "__none__"}
                onValueChange={(value) =>
                  setNewAgeGroup(value === "__none__" ? "" : (value ?? ""))
                }
              >
                <SelectTrigger className={CHARACTER_SELECT_TRIGGER_CLASS}>
                  <SelectValue>
                    {(value: string) =>
                      !value || value === "__none__"
                        ? t("characters.identities.inheritFromCharacter")
                        : (() => {
                            const labelKey = labelKeyFor(
                              AGE_GROUP_OPTIONS,
                              value,
                            );
                            return labelKey ? t(labelKey) : value;
                          })()
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  sideOffset={8}
                  className={CHARACTER_SELECT_CONTENT_CLASS}
                >
                  <SelectItem value="__none__">
                    {t("characters.identities.inheritFromCharacter")}
                  </SelectItem>
                  {AGE_GROUP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("characters.identities.appearance")}
              </Label>
              <textarea
                className={cn(CHARACTER_TEXTAREA_CLASS, "min-h-24")}
                rows={4}
                value={newAppearance}
                onChange={(e) => setNewAppearance(e.target.value)}
                placeholder={t("characters.identities.appearancePlaceholder")}
              />
            </div>
            <DialogFooter className={CHARACTER_DIALOG_FOOTER_CLASS}>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
                className={CHARACTER_DIALOG_CANCEL_BUTTON_CLASS}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={createPending || !newName.trim()}
                className={CHARACTER_DIALOG_ACTION_BUTTON_CLASS}
              >
                {createPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {t("common.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ─── Right detail panel ──────────────────────────────────────────────────────

export function EmptyCharacterDetailView() {
  const { t } = useTranslation();
  return (
    <aside className="flex h-full w-full flex-col items-center justify-center bg-background p-6 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-border bg-card">
        <Users className="size-5 text-muted-foreground" />
      </div>
      <p className="max-w-[15rem] text-xs leading-5 text-muted-foreground">
        {t("characters.drawer.pickOne")}
      </p>
    </aside>
  );
}

export function CharacterDetailView({
  controller,
  identitiesContent,
  portraitHistory,
  voiceContent,
}: {
  controller: CharacterDetailController;
  identitiesContent: ReactNode;
  portraitHistory: ReactNode;
  voiceContent: ReactNode;
}) {
  const { character } = controller;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [character.name]);

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div
        ref={scrollContainerRef}
        className="@container flex-1 space-y-3 overflow-y-auto p-4"
      >
        <section className="rounded-[10px] border border-border bg-card p-4">
          <CharacterHeaderRow controller={controller} />
          <div className="mt-5 grid grid-cols-1 gap-5 @[900px]:grid-cols-[180px_minmax(0,1fr)]">
            <div className="w-full max-w-[180px] @[900px]:max-w-none">
              <PortraitBlock
                controller={controller}
                historyContent={portraitHistory}
              />
            </div>
            <div className="min-w-0">
              <DetailsFormCard controller={controller} />
            </div>
          </div>
        </section>
        {voiceContent}
        {identitiesContent}
      </div>
    </aside>
  );
}

function ProjectVoicesPanel({
  isNarratedFirstPerson,
  narratorMain,
  narratorVoiceContent,
  onSelectNarratorMain,
}: {
  isNarratedFirstPerson: boolean;
  narratorMain: Character | null;
  narratorVoiceContent: ReactNode;
  onSelectNarratorMain: () => void;
}) {
  const { t } = useTranslation();
  if (isNarratedFirstPerson) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-background p-6">
        <section className="w-full max-w-[640px] rounded-[10px] border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Mic2 className="size-4 text-muted-foreground/78" />
            <h2 className="text-sm font-semibold text-foreground">
              {t("characters.voices.firstPersonNarratedTitle")}
            </h2>
          </div>
          <p className="mt-5 text-xs leading-5 text-muted-foreground/78">
            {narratorMain
              ? t("characters.voices.firstPersonNarratedDesc", {
                  name: narratorMain.name,
                })
              : t("characters.voices.firstPersonNarratedMissingMain")}
          </p>
          {narratorMain && (
            <div className="mt-10 flex justify-center">
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={onSelectNarratorMain}
                className="h-7 gap-1 rounded-[7px] border-border bg-muted px-2.5 text-[12px] font-normal text-foreground/76 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
              >
                {t("characters.voices.openNarratorMainVoice")}
              </Button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background p-6">
      <div className="w-full max-w-3xl">
        {narratorVoiceContent}
      </div>
    </div>
  );
}

// ─── Add character dialog ────────────────────────────────────────────────────

export function AddCharacterDialogView({
  controller,
}: {
  controller: AddCharacterController;
}) {
  const { t } = useTranslation();
  const {
    createPending,
    gender,
    onOpenChange,
    open,
    register,
    role,
    setGender,
    setRole,
    submit,
  } = controller;
  const inputClass =
    "h-10 rounded-[8px] border-border bg-muted px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";
  const selectTriggerClass =
    "h-10 w-full rounded-[8px] border-border bg-muted px-3 text-sm text-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";
  const labelClass = "text-xs font-medium text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(CHARACTER_DIALOG_CONTENT_CLASS, "sm:max-w-xl")}
      >
        <DialogHeader className="gap-2">
          <DialogTitle className="text-lg font-medium tracking-tight">
            {t("characters.addCharacter")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="relative space-y-3.5"
        >
          <div className="space-y-1.5">
            <Label className={labelClass}>
              {t("characters.basics.name")} *
            </Label>
            <Input {...register("name")} autoFocus className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={labelClass}>
                {t("characters.basics.role")}
              </Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  if (value !== null) {
                    setRole(value);
                  }
                }}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue placeholder={t("characters.rolePlaceholder")}>
                    {(val: string) => {
                      const opt = ROLE_OPTIONS.find((o) => o.value === val);
                      return opt ? t(opt.labelKey) : val;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  sideOffset={8}
                  className={CHARACTER_SELECT_CONTENT_CLASS}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>
                {t("characters.basics.gender")}
              </Label>
              <Select
                value={gender}
                onValueChange={(value) => {
                  if (value !== null) {
                    setGender(value);
                  }
                }}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue
                    placeholder={`${t("characters.genders.male")} / ${t(
                      "characters.genders.female",
                    )}`}
                  >
                    {(val: string) => {
                      const opt = GENDER_OPTIONS.find((o) => o.value === val);
                      return opt ? t(opt.labelKey) : val;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  sideOffset={8}
                  className={CHARACTER_SELECT_CONTENT_CLASS}
                >
                  {GENDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>
              {t("characters.basics.description")}
            </Label>
            <Input {...register("description")} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>
              {t("characters.basics.facePrompt")}
            </Label>
            <Input
              placeholder="oval face, big eyes"
              className={inputClass}
              {...register("face_prompt")}
            />
          </div>
          <DialogFooter className={CHARACTER_DIALOG_FOOTER_CLASS}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className={CHARACTER_DIALOG_CANCEL_BUTTON_CLASS}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={createPending}
              className={CHARACTER_DIALOG_ACTION_BUTTON_CLASS}
            >
              {createPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

/**
 * Character-list / detail split.
 *
 * Desktop (≥lg): fixed-width left sidebar (288px) + flexible right detail area.
 * Narrow: stacked layout (list on top, detail below).
 */
function CharactersSplit({
  isDesktop,
  buildStarted,
  taskStream,
  isLoading,
  characters,
  totalCharacters,
  mainCopy,
  searchQuery,
  onSearchQueryChange,
  selectedName,
  setSelectedName,
  detailContent,
  onRebuild,
  rebuildDisabled,
  buildCharactersCostDisplay,
}: {
  isDesktop: boolean;
  buildStarted: boolean;
  taskStream: CharactersPageController["taskStream"];
  isLoading: boolean;
  characters: Character[];
  totalCharacters: number;
  mainCopy: CharacterMainCopy;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  selectedName: string | null;
  setSelectedName: (name: string | null) => void;
  detailContent: ReactNode;
  onRebuild: () => void;
  rebuildDisabled: boolean;
  buildCharactersCostDisplay?: string | null;
}) {
  const { t } = useTranslation();
  const isExtracting = buildStarted && taskStream.status !== "idle";
  const searchActive = searchQuery.trim().length > 0;
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const previousCharacterCountRef = useRef(characters.length);

  useEffect(() => {
    if (characters.length > previousCharacterCountRef.current) {
      listScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    previousCharacterCountRef.current = characters.length;
  }, [characters.length]);

  const extractingProgress = (
    <div
      className="w-full max-w-[220px] rounded-[8px] bg-muted p-3"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {taskStream.currentTask || t("characters.extracting")}
        </span>
        <span className="shrink-0 font-mono tabular-nums text-foreground/80">
          {Math.round(taskStream.progress * 100)}%
        </span>
      </div>
      <Progress value={taskStream.progress * 100} className="mt-3 h-1.5" />
    </div>
  );

  const listPane = (
    <>
      {totalCharacters > 0 && (
        <div className="p-3 pb-2">
          <CharacterSearch
            value={searchQuery}
            onValueChange={onSearchQueryChange}
            resultCount={characters.length}
            totalCount={totalCharacters}
            placeholder={t("characters.searchPlaceholder")}
          />
        </div>
      )}
      <div ref={listScrollRef} className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <SidebarListSkeleton label={t("common.loading")} />
        ) : totalCharacters === 0 && isExtracting ? (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-border bg-card">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
            <h2 className="mb-1.5 text-sm font-semibold text-foreground">
              {t("characters.extractingEmpty.title")}
            </h2>
            <p className="max-w-[15rem] text-xs leading-5 text-muted-foreground">
              {t("characters.extractingEmpty.description")}
            </p>
            <div className="mt-4 flex justify-center">
              {extractingProgress}
            </div>
          </div>
        ) : totalCharacters === 0 ? (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-border bg-card">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <h2 className="mb-1.5 text-sm font-semibold text-foreground">
              {t("characters.empty.title")}
            </h2>
            <p className="max-w-[15rem] text-xs leading-5 text-muted-foreground">
              {t("characters.empty.description")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRebuild}
              disabled={rebuildDisabled}
              className={EMPTY_STATE_ACTION_BUTTON_CLASS}
            >
              <RefreshCw className="size-3.5" />
              {t("characters.autoExtract")}
              <CreditCostInline display={buildCharactersCostDisplay} />
            </Button>
          </div>
        ) : searchActive && characters.length === 0 ? (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-border bg-card">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <h2 className="mb-1.5 text-sm font-semibold text-foreground">
              {t("characters.filter.noMatch")}
            </h2>
            <p className="max-w-[15rem] text-xs leading-5 text-muted-foreground">
              {t("characters.searchPlaceholder")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {isExtracting && (
              <div className="flex justify-center">
                {extractingProgress}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {characters.map((char) => (
                <CharacterListItem
                  key={char.name}
                  character={char}
                  selected={selectedName === char.name}
                  onSelect={() => setSelectedName(char.name)}
                  mainCharacterLabel={mainCopy.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (!isDesktop) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-hidden border-b border-border">
          {listPane}
        </div>
        <div className="min-w-0 flex-1">{detailContent}</div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 flex overflow-hidden bg-background">
      <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-border bg-background">
        {listPane}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden bg-background">
        {detailContent}
      </div>
    </div>
  );
}

export function CharactersPageView({
  addDialogContent,
  controller,
  detailContent,
  imageSourceControl,
  narratorVoiceContent,
  propsContent,
  scenesContent,
}: {
  addDialogContent: ReactNode;
  controller: CharactersPageController;
  detailContent: ReactNode;
  imageSourceControl: ReactNode;
  narratorVoiceContent: ReactNode;
  propsContent: ReactNode;
  scenesContent: ReactNode;
}) {
  const { t } = useTranslation();
  const {
    assetTab,
    buildCharactersCostDisplay,
    buildStarted,
    characters,
    filteredCharacters,
    handleAssetTabChange,
    handleBuild,
    isDesktop,
    isLoading,
    isNarratedFirstPerson,
    mainCopy,
    narratorMain,
    openAddDialog,
    openRebuildDialog,
    project,
    rebuildDialogOpen,
    rebuildDisabled,
    searchQuery,
    selectCharacter,
    selectedName,
    selectNarratorMain,
    setRebuildDialogOpen,
    setSearchQuery,
    taskStream,
  } = controller;

  return (
    <AssetHeaderActionsSlotProvider>
      <div className="-m-6 flex h-[calc(100%+3rem)] flex-col overflow-hidden">
      <CharactersPageHeader
        onRebuild={openRebuildDialog}
        rebuildDisabled={rebuildDisabled}
        buildCharactersCostDisplay={buildCharactersCostDisplay}
        onAdd={openAddDialog}
        project={project}
        activeTab={assetTab}
        imageSourceControl={imageSourceControl}
      />

      <AssetTabs value={assetTab} onChange={handleAssetTabChange} />

      {assetTab === "characters" ? (
        <>
          <div className="shrink-0 border-b border-border bg-background px-3 py-3 lg:px-9">
            <CharacterStatsStrip
              characters={characters}
              mainCharacterLabel={mainCopy.label}
            />
          </div>
          <CharactersSplit
            isDesktop={isDesktop}
            buildStarted={buildStarted}
            taskStream={taskStream}
            isLoading={isLoading}
            characters={filteredCharacters}
            totalCharacters={characters.length}
            mainCopy={mainCopy}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            selectedName={selectedName}
            setSelectedName={selectCharacter}
            detailContent={detailContent}
            onRebuild={openRebuildDialog}
            rebuildDisabled={rebuildDisabled}
            buildCharactersCostDisplay={buildCharactersCostDisplay}
          />
        </>
      ) : assetTab === "voices" ? (
        <ProjectVoicesPanel
          isNarratedFirstPerson={isNarratedFirstPerson}
          narratorMain={narratorMain}
          narratorVoiceContent={narratorVoiceContent}
          onSelectNarratorMain={selectNarratorMain}
        />
      ) : assetTab === "scenes" ? (
        <>{scenesContent}</>
      ) : (
        <>{propsContent}</>
      )}

      {/* Rebuild confirm */}
      <AlertDialog open={rebuildDialogOpen} onOpenChange={setRebuildDialogOpen}>
        <AlertDialogTrigger className="hidden" />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("characters.reExtractTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("characters.reExtractDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleBuild()}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {addDialogContent}
      </div>
    </AssetHeaderActionsSlotProvider>
  );
}
