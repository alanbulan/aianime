// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { type ReactNode, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  CheckCircle2,
  Code,
  Image as ImageIcon,
  Info,
  Loader2,
  Pencil,
  Paintbrush,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import type { CreateStyleController } from "@/modules/asset_world/application/use-create-style-controller";
import type { StyleDetailController } from "@/modules/asset_world/application/use-style-detail-controller";
import type { StylesPageController } from "@/modules/asset_world/application/use-styles-page-controller";
import {
  STYLE_PREVIEW_ACCEPT,
  type Style,
} from "@/modules/asset_world/domain/style";
import { Button } from "@/components/ui/button";
import { HeaderRefreshButton } from "@/components/ui/header-refresh-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SidebarListSkeleton, DetailPaneSkeleton } from "@/components/skeletons";
import { CreditCostInline } from "@/components/credit-cost-inline";

// ─── style constants (aligned with characters page) ─────────────────────────

const STYLES_INPUT_CLASS =
  "h-9 rounded-[8px] border-border bg-muted px-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";
const STYLES_TEXTAREA_CLASS =
  "w-full resize-none rounded-[8px] border border-border bg-muted p-2.5 text-sm leading-relaxed shadow-none placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10";

// ─── small components ───────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3.5">
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

function Section({
  title,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  icon,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const toggleOpen = () => {
    const next = !open;
    if (onOpenChange) {
      onOpenChange(next);
    } else {
      setUncontrolledOpen(next);
    }
  };

  return (
    <div className="rounded-[10px] border border-border bg-card">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-foreground/80 hover:bg-muted"
      >
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground/85 transition-transform",
            !open && "-rotate-90",
          )}
        />
        {icon}
        <span className="flex-1">{title}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border bg-muted p-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Top bar ────────────────────────────────────────────────────────────────

function TopBar({ onCreate, onRefresh, refreshing }: { onCreate: () => void; onRefresh: () => Promise<boolean>; refreshing: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-9 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Paintbrush className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
            {t("nav.styles")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("styles.selectStyleHint")}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
        <HeaderRefreshButton
          label={t("common.refresh")}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
        <Button
          size="sm"
          onClick={onCreate}
          className="h-8 gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75"
        >
          <Plus className="size-3.5" />
          {t("styles.createStyle")}
        </Button>
      </div>
    </div>
  );
}

// ─── Style list item ────────────────────────────────────────────────────────

function StyleListItem({
  style,
  selected,
  isProjectDefault,
  onSelect,
  preset,
  previewSrc,
}: {
  style: Style;
  selected: boolean;
  isProjectDefault: boolean;
  onSelect: () => void;
  preset: boolean;
  previewSrc?: string | null;
}) {
  const { t } = useTranslation();
  const display = style.label || style.name;
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
      {previewSrc ? (
        <img
          src={previewSrc}
          alt={display}
          loading="lazy"
          className="size-9 shrink-0 rounded-[6px] border border-border object-cover"
        />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[6px] border border-border bg-muted">
          <Paintbrush className="size-4 text-muted-foreground" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-foreground">
            {display}
          </span>
          {isProjectDefault && (
            <CheckCircle2
              className="size-3.5 shrink-0 text-primary"
              aria-label={t("styles.projectDefault")}
            />
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {style.id} · {preset ? t("styles.preset") : t("styles.custom")}
        </p>
      </div>
    </button>
  );
}

// ─── Preview box ────────────────────────────────────────────────────────────

function PreviewBox({
  preset,
  previewUrl,
  style,
}: {
  preset: boolean;
  previewUrl?: string | null;
  style: Style;
}) {
  const { t } = useTranslation();
  const [hasError, setHasError] = useState(false);

  // Reset error state when style switches.
  useEffect(() => {
    setHasError(false);
  }, [style.id]);

  if (!preset && !previewUrl) {
    return (
      <div className="flex aspect-video items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted px-4 text-center">
        <Info className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-snug text-muted-foreground/80">
          {t("styles.customPreviewEmpty")}
        </p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-border bg-muted">
        <ImageIcon className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={previewUrl ?? undefined}
      alt={`${style.name} preview`}
      loading="lazy"
      decoding="async"
      className="aspect-video w-full rounded-lg border border-border object-cover"
      onError={() => setHasError(true)}
    />
  );
}

// ─── Detail panel ───────────────────────────────────────────────────────────

export function StyleDetailView({
  controller,
}: {
  controller: StyleDetailController;
}) {
  const { t } = useTranslation();
  const {
    applyPending,
    createPending,
    deletePending,
    dirty,
    editingName,
    fields,
    handleApplyToProject,
    handleDelete,
    handleRename,
    handleSave,
    isProjectDefault,
    jsonError,
    jsonText,
    nameEditOpen,
    nameEditValue,
    onJsonTextChange,
    openRename,
    preset,
    previewUrl,
    setJsonEditorOpen,
    setNameEditOpen,
    setNameEditValue,
    showJson,
    style,
    updateField,
  } = controller;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-2">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {editingName}
        </span>
        <button
          type="button"
          onClick={openRename}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Rename style"
        >
          <Pencil className="size-3" />
        </button>
        {isProjectDefault && (
          <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            项目默认
          </span>
        )}
        {dirty && (
          <span className="inline-flex shrink-0 items-center rounded-md border border-warning/35 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
            未保存
          </span>
        )}
      </div>

      {/* Rename dialog */}
      <Dialog open={nameEditOpen} onOpenChange={setNameEditOpen}>
        <DialogContent className="rounded-xl border border-border bg-popover/95 p-6 shadow-xl backdrop-blur-3xl sm:max-w-sm">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-sm font-medium tracking-tight">
              {t("styles.renameTitle", "重命名风格")}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={nameEditValue}
            onChange={(e) => setNameEditValue(e.target.value)}
            placeholder={style.name}
            className="h-9 rounded-[8px] border-border bg-muted px-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setNameEditOpen(false);
            }}
          />
          <DialogFooter className="mt-1 flex justify-end gap-2 border-0 bg-transparent p-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNameEditOpen(false)}
              className="h-8 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none hover:bg-muted"
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleRename}
              disabled={createPending || !nameEditValue.trim()}
              className="h-8 rounded-[8px] bg-primary px-3 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/90"
            >
              {createPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : null}
              {t("common.save", "保存")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scrolling content */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Preview */}
        <div className="mb-6 w-full max-w-[240px]">
          <PreviewBox
            preset={preset}
            previewUrl={previewUrl}
            style={style}
          />
        </div>

        {/* Editor */}
        <div className="space-y-3">
          <Field label={t("styles.labelField")}>
            <Input
              value={fields.label}
              onChange={(e) => updateField("label", e.target.value)}
              placeholder={t("styles.labelPlaceholder")}
              className={STYLES_INPUT_CLASS}
            />
          </Field>

          <Section title={t("styles.projectStyleSection")} defaultOpen={false}>
            <Field label={t("styles.styleDirective")}>
              <Textarea
                value={fields.style_instructions}
                onChange={(e) =>
                  updateField("style_instructions", e.target.value)
                }
                rows={4}
                className={STYLES_TEXTAREA_CLASS}
              />
            </Field>
            <Field label={t("styles.avoidDirective")}>
              <Textarea
                value={fields.avoid_instructions}
                onChange={(e) =>
                  updateField("avoid_instructions", e.target.value)
                }
                rows={3}
                className={STYLES_TEXTAREA_CLASS}
              />
            </Field>
            <Field
              label={t("styles.styleTag")}
              hint={t("styles.styleTagHint")}
            >
              <Input
                value={fields.style_tag}
                onChange={(e) =>
                  updateField("style_tag", e.target.value)
                }
                placeholder={t("styles.styleTagPlaceholder")}
                className={STYLES_INPUT_CLASS}
              />
            </Field>
          </Section>

          <Section
            title={t("styles.jsonEdit")}
            defaultOpen={false}
            open={showJson}
            onOpenChange={setJsonEditorOpen}
            icon={<Code className="size-3.5" />}
          >
            <textarea
              className={cn(STYLES_TEXTAREA_CLASS, "min-h-[300px] font-mono")}
              value={jsonText}
              onChange={(e) => onJsonTextChange(e.target.value)}
              spellCheck={false}
            />
            {jsonError && (
              <p className="text-xs text-destructive">{jsonError}</p>
            )}
          </Section>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={createPending || !dirty}
          className="h-7 gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75"
        >
          {createPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Save className="size-3" />
          )}
          {t("styles.save")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleApplyToProject}
          disabled={applyPending || isProjectDefault}
          className="h-7 gap-1.5 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none hover:bg-muted"
        >
          {applyPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Check className="size-3" />
          )}
          {isProjectDefault ? t("styles.alreadyDefault") : t("styles.applyToProject")}
        </Button>
        {!preset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deletePending}
            className="ml-auto gap-1.5 h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {deletePending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
            {t("styles.delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Empty detail ───────────────────────────────────────────────────────────

function EmptyDetail({
  hasStyles,
  onCreate,
}: {
  hasStyles: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-full border border-border bg-card">
          <Paintbrush className="size-6 text-muted-foreground" />
        </div>
        {hasStyles ? (
          <>
            <h2 className="text-sm font-semibold text-foreground">{t("styles.selectStyle")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("styles.selectStyleHint")}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-foreground">{t("styles.noStyles")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("styles.noStylesHint")}
            </p>
            <Button onClick={onCreate} className="mt-2 h-8 gap-1.5 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none hover:bg-muted">
              <Plus className="size-3.5" />
              {t("styles.createStyle")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Create dialog ──────────────────────────────────────────────────────────

export function CreateStyleDialogView({
  controller,
}: {
  controller: CreateStyleController;
}) {
  const { t } = useTranslation();
  const {
    analyzed,
    analyzePending,
    createDisabled,
    createPending,
    fileInputRef,
    handleAnalyze,
    handleCreate,
    id,
    name,
    onOpenChange,
    open,
    previewUrl,
    setId,
    setName,
    styleAnalyzeCostDisplay,
  } = controller;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 overflow-hidden rounded-2xl border border-border bg-popover/95 p-7 shadow-xl backdrop-blur-3xl sm:max-w-lg">
        <DialogHeader className="gap-2">
          <DialogTitle className="flex items-center gap-2 text-lg font-medium tracking-tight">
            <span aria-hidden="true">✨</span>
            <span>{t("styles.createTitle")}</span>
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("styles.createHint")}
          </p>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("styles.styleId")}
              </Label>
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="cyberpunk_v1"
                className="h-9 rounded-[8px] border-border bg-muted px-3 text-sm font-mono placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("styles.nameField")}
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("styles.namePlaceholder")}
                className="h-9 rounded-[8px] border-border bg-muted px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("styles.aiAnalyze")}
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzePending || !id.trim()}
              title={!id.trim() ? t("styles.styleIdRequiredBeforeUpload") : undefined}
              className="h-9 w-fit gap-1.5 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none hover:bg-muted"
            >
              {analyzePending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {analyzed ? t("styles.reupload") : t("styles.uploadRef")}
              <CreditCostInline display={styleAnalyzeCostDisplay} />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={STYLE_PREVIEW_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAnalyze(file);
              }}
            />
          </div>

          {previewUrl && (
            <div className="relative overflow-hidden rounded-lg border border-border">
              <img
                src={previewUrl}
                alt={t("styles.uploadedPreview")}
                className="max-h-40 w-full object-contain"
              />
              {analyzePending && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-media/55 text-xs text-media-foreground/85 backdrop-blur-[2px]"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  <span>{t("styles.analyzingPreview")}</span>
                </div>
              )}
            </div>
          )}

          {analyzed && (
            <div className="space-y-2 rounded-lg border border-border bg-muted p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3 text-primary" />
                {t("styles.aiExtractedHint")}
              </div>
              {analyzed.style_instructions && (
                <Field label={t("styles.styleDirective")}>
                  <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">
                    {analyzed.style_instructions}
                  </p>
                </Field>
              )}
              {analyzed.avoid_instructions && (
                <Field label={t("styles.avoidDirective")}>
                  <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80">
                    {analyzed.avoid_instructions}
                  </p>
                </Field>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="-mx-7 -mb-7 border-t-0 bg-transparent p-7 pt-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 hover:border-foreground/30 hover:bg-accent hover:text-foreground"
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={createDisabled}
            className="h-10 rounded-md bg-primary px-4 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
          >
            {createPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" />
            )}
            {t("styles.createStyle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function StylesPageView({
  controller,
  createDialog,
  detailContent,
}: {
  controller: StylesPageController;
  createDialog: ReactNode;
  detailContent: ReactNode;
}) {
  const { t } = useTranslation();
  const {
    detailFetching,
    handleRefresh,
    isLoading,
    isPreset,
    openCreate,
    previewUrlForStyle,
    projectVisualStyle,
    refreshing,
    selectedId,
    selectedStyle,
    selectStyle,
    styles,
  } = controller;

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] flex-col overflow-hidden">
      <TopBar
        onCreate={openCreate}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* LEFT: list */}
        <div className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-hidden border-b border-border lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r lg:border-border">
          <div className="flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <SidebarListSkeleton label={t("common.loading")} />
            ) : styles.length === 0 ? (
              <div className="mt-8 flex flex-col items-center text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-border bg-card">
                  <Paintbrush className="size-5 text-muted-foreground" />
                </div>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {t("styles.noStylesAvailable")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {styles.map((style) => (
                  <StyleListItem
                    key={style.id}
                    style={style}
                    selected={style.id === selectedId}
                    isProjectDefault={style.id === projectVisualStyle}
                    onSelect={() => selectStyle(style.id)}
                    preset={isPreset(style)}
                    previewSrc={previewUrlForStyle(style)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: detail */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {selectedStyle ? (
            detailContent
          ) : detailFetching ? (
            <DetailPaneSkeleton label={t("common.loading")} />
          ) : (
            <EmptyDetail
              hasStyles={styles.length > 0}
              onCreate={openCreate}
            />
          )}
        </div>
      </div>

      {createDialog}
    </div>
  );
}
