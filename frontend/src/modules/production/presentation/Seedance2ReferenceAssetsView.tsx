// Copyright (c) 2026 AI anime
import { useRef, type DragEvent, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronDown,
  Image as ImageIcon,
  Library,
  Loader2,
  Mic,
  Scissors,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import type { Seedance2AssetOperationsController } from "@/modules/production/application/use-seedance2-asset-operations-controller";
import { seedance2CropTargetForAsset } from "@/modules/production/domain/seedance2-crop";
import type { Seedance2AssetItem } from "@/modules/production/domain/seedance2-panel";
import type { Seedance2ConfigDraft } from "@/modules/production/domain/video-config";

const SECONDARY_ACTION_CLASS =
  "h-7 gap-1 rounded-[7px] border-border bg-muted px-2.5 text-[12px] font-normal text-foreground/76 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground disabled:border-border disabled:bg-muted disabled:text-muted-foreground/45";
const COLLAPSE_TRIGGER_CLASS =
  "-ml-1 h-6 gap-1.5 px-1 text-xs font-medium text-foreground/78 !bg-transparent hover:!bg-transparent hover:text-foreground aria-expanded:!bg-transparent dark:hover:!bg-transparent";
const REFERENCE_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(6.75rem,6.75rem))] gap-2";
const REFERENCE_TILE_CLASS =
  "group/reference-tile relative w-[6.75rem] overflow-hidden rounded-[7px] border border-border bg-muted transition-[border-color,background-color,box-shadow] duration-200 hover:border-foreground/25 hover:bg-accent";
const TILE_ACTION_CLASS =
  "size-6 rounded-[6px] border border-media-foreground/20 bg-media/70 text-media-foreground/90 shadow-lg backdrop-blur-sm hover:border-media-foreground/30 hover:bg-media-foreground/15 hover:text-media-foreground";

interface Seedance2ReferenceStats {
  fallbacks: number;
  invalid: number;
  missing: number;
  selected: number;
  unused: number;
}

type ReferenceAssetState = NonNullable<Seedance2AssetItem["state"]>;

const REFERENCE_STATE_LABEL_KEYS: Record<ReferenceAssetState, string> = {
  sent: "seedance2ReferenceSent",
  invalid: "seedance2ReferenceInvalid",
  missing: "seedance2ReferenceMissing",
  fallback: "seedance2ReferenceFallback",
  unused: "seedance2ReferenceUnused",
};

export function seedance2ReferenceStatsText(
  t: TFunction,
  stats: Seedance2ReferenceStats,
): string {
  const parts = [
    t("episode.workbench.video.seedance2ReferenceStatSent", {
      count: stats.selected,
    }),
  ];
  if (stats.invalid > 0) {
    parts.push(
      t("episode.workbench.video.seedance2ReferenceStatInvalid", {
        count: stats.invalid,
      }),
    );
  }
  if (stats.missing > 0) {
    parts.push(
      t("episode.workbench.video.seedance2ReferenceStatMissing", {
        count: stats.missing,
      }),
    );
  }
  if (stats.unused > 0) {
    parts.push(
      t("episode.workbench.video.seedance2ReferenceStatUnused", {
        count: stats.unused,
      }),
    );
  }
  if (stats.fallbacks > 0) {
    parts.push(
      t("episode.workbench.video.seedance2ReferenceStatFallback", {
        count: stats.fallbacks,
      }),
    );
  }
  return parts.join(" · ");
}

function referenceAssetState(
  asset: Seedance2AssetItem,
): ReferenceAssetState {
  // The API state is authoritative; keep this fallback aligned with backend
  // _asset_delivery_state for older payloads.
  if (asset.state) return asset.state;
  if (asset.selected) return "sent";
  if (asset.validation_error) return "invalid";
  if (asset.exists === false) {
    if (asset.fallback_text && asset.required === false) return "fallback";
    return asset.required === false ? "unused" : "missing";
  }
  if (asset.fallback_text) return "fallback";
  return "unused";
}

function ReferencePanelHeader({
  badge,
  children,
  open,
  onOpenChange,
}: {
  badge: ReactNode;
  children?: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Button
        type="button"
        size="xs"
        variant="ghost"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={COLLAPSE_TRIGGER_CLASS}
      >
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            !open && "-rotate-90",
          )}
        />
        <Library className="size-3.5 text-muted-foreground/78" />
        <span>{t("episode.workbench.video.seedance2ReferenceDetails")}</span>
      </Button>
      <span className="inline-flex h-5 max-w-full items-center rounded-full border border-border bg-muted px-2 text-[11px] leading-none text-muted-foreground">
        {badge}
      </span>
      {children}
    </div>
  );
}

function EmptyReferences() {
  const { t } = useTranslation();

  return (
    <p className="rounded-[8px] border border-dashed border-border bg-muted p-2 text-xs text-muted-foreground">
      {t("episode.workbench.video.seedance2ReferenceEmpty")}
    </p>
  );
}

export function Seedance2ReferenceCropAssetsView({
  aspectRatio,
  assets,
  className,
  controller,
  open,
  onOpenChange,
}: {
  aspectRatio: string;
  assets: Seedance2AssetItem[];
  className?: string;
  controller: Seedance2AssetOperationsController;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "col-span-2 rounded-[10px] border border-border bg-card",
        className,
      )}
    >
      <ReferencePanelHeader
        badge={assets.length}
        open={open}
        onOpenChange={onOpenChange}
      />
      {open && (
        <div className="border-t border-border p-3">
          {assets.length > 0 ? (
            <div className={REFERENCE_GRID_CLASS}>
              {assets.map((asset) => {
                const assetImageSrc = resolveMediaUrl(asset.url || asset.path);
                return (
                  <div
                    key={asset.key}
                    data-seedance2-reference-tile
                    className={REFERENCE_TILE_CLASS}
                    style={{ aspectRatio }}
                    data-ui-tooltip={asset.note || asset.label}
                  >
                    {assetImageSrc ? (
                      <img
                        src={assetImageSrc}
                        alt={asset.label}
                        className="absolute inset-0 h-full w-full object-cover"
                        decoding="async"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted">
                        <ImageIcon className="size-6 text-muted-foreground/70" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media/80 via-media/45 to-transparent p-1.5 pt-5">
                      <div className="truncate text-[10px] font-medium leading-3 text-media-foreground/90">
                        {asset.label}
                      </div>
                      {asset.note && (
                        <div className="truncate text-[9px] leading-3 text-media-foreground/50">
                          {asset.note}
                        </div>
                      )}
                    </div>
                    {asset.can_crop && (
                      <div className="absolute bottom-1.5 right-1.5 opacity-0 transition-opacity duration-150 group-hover/reference-tile:opacity-100 group-focus-within/reference-tile:opacity-100">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={TILE_ACTION_CLASS}
                          aria-label={t(
                            "episode.workbench.video.seedance2AssetCrop",
                          )}
                          onClick={() =>
                            controller.openCrop({
                              asset,
                              target: "first_frame",
                            })
                          }
                        >
                          <Scissors className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyReferences />
          )}
        </div>
      )}
    </div>
  );
}

export function Seedance2ReferenceAssetsView({
  assets,
  controller,
  imageOnly,
  invalidCount,
  fallbackCount,
  missingCount,
  mode,
  open,
  selectedCount,
  unusedCount,
  onOpenChange,
  onReferenceDragStart,
}: {
  assets: Seedance2AssetItem[];
  controller: Seedance2AssetOperationsController;
  imageOnly: boolean;
  invalidCount: number;
  fallbackCount: number;
  missingCount: number;
  mode: Seedance2ConfigDraft["mode"];
  open: boolean;
  selectedCount: number;
  unusedCount: number;
  onOpenChange(open: boolean): void;
  onReferenceDragStart(event: DragEvent<HTMLElement>, label: string): void;
}) {
  const { t } = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const problemAssets = assets.filter((asset) => {
    const state = referenceAssetState(asset);
    return state === "invalid" || state === "missing";
  });

  return (
    <div className="rounded-[10px] border border-border bg-card">
      <ReferencePanelHeader
        badge={seedance2ReferenceStatsText(t, {
          fallbacks: fallbackCount,
          invalid: invalidCount,
          missing: missingCount,
          selected: selectedCount,
          unused: unusedCount,
        })}
        open={open}
        onOpenChange={onOpenChange}
      >
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={controller.uploadPending}
          onClick={() => uploadInputRef.current?.click()}
          className={cn("ml-auto", SECONDARY_ACTION_CLASS)}
        >
          {controller.uploadPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Upload className="size-3" />
          )}
          {t("episode.workbench.video.seedance2AssetUpload")}
        </Button>
        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          accept={imageOnly ? "image/*" : "image/*,audio/*"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void controller.uploadAsset(file);
            event.target.value = "";
          }}
        />
      </ReferencePanelHeader>
      {open && (
        <div className="border-t border-border p-3">
          {assets.length > 0 ? (
            <div className={REFERENCE_GRID_CLASS}>
              {assets.map((asset) => {
                const state = referenceAssetState(asset);
                const referenceLabel =
                  asset.reference_label && asset.reference_label !== "未发送"
                    ? asset.reference_label
                    : "";
                const canInsertReference =
                  referenceLabel.length > 0 && asset.exists !== false;
                const isMissingImage =
                  asset.media_type === "image" && asset.exists === false;
                const displayReferenceLabel =
                  referenceLabel ||
                  (isMissingImage
                    ? t("episode.workbench.video.seedance2ReferenceImage")
                    : asset.reference_label);
                const assetImageSrc =
                  asset.media_type === "image" &&
                  asset.exists !== false &&
                  (asset.url || asset.path)
                    ? resolveMediaUrl(asset.url || asset.path)
                    : null;
                const hasFallback = state === "fallback";
                const showTileText =
                  Boolean(assetImageSrc) ||
                  asset.media_type === "audio" ||
                  hasFallback ||
                  asset.exists === false;
                const hasTileActions =
                  (asset.can_crop && asset.media_type === "image") ||
                  (asset.can_trim && asset.media_type === "audio") ||
                  asset.can_delete;
                const stateLabel = t(
                  `episode.workbench.video.${REFERENCE_STATE_LABEL_KEYS[state]}`,
                );
                const tileDetail =
                  asset.validation_error || asset.status_detail || asset.note;
                return (
                  <div
                    key={asset.key}
                    data-seedance2-reference-tile
                    draggable={canInsertReference}
                    onDragStart={(event) => {
                      if (referenceLabel) {
                        onReferenceDragStart(event, referenceLabel);
                      }
                    }}
                    className={cn(
                      REFERENCE_TILE_CLASS,
                      "aspect-square",
                      canInsertReference &&
                        "cursor-grab active:cursor-grabbing hover:shadow-xl",
                    )}
                    data-ui-tooltip={tileDetail || asset.label}
                  >
                    {assetImageSrc ? (
                      <img
                        src={assetImageSrc}
                        alt={asset.label}
                        draggable={canInsertReference}
                        onDragStart={(event) => {
                          if (referenceLabel) {
                            onReferenceDragStart(event, referenceLabel);
                          }
                        }}
                        className={cn(
                          "absolute inset-0 h-full w-full object-cover",
                          canInsertReference &&
                            "cursor-grab active:cursor-grabbing",
                        )}
                        decoding="async"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted">
                        {asset.media_type === "audio" ? (
                          <Mic className="size-6 text-muted-foreground/70" />
                        ) : (
                          <ImageIcon className="size-6 text-muted-foreground/70" />
                        )}
                      </div>
                    )}
                    <div className="absolute inset-x-1 top-1 flex min-w-0 items-center justify-between gap-1">
                      <span className="truncate rounded-[4px] border border-media-foreground/10 bg-media/55 px-1 py-0.5 text-[10px] font-medium leading-none text-media-foreground/90 shadow-sm backdrop-blur-sm">
                        {displayReferenceLabel}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-[4px] border px-1 py-0.5 text-[10px] leading-none shadow-sm backdrop-blur-sm",
                          state === "sent"
                            ? "border-primary/35 bg-primary/18 text-primary"
                            : state === "invalid" || state === "missing"
                              ? "border-destructive/35 bg-destructive/15 text-destructive"
                            : "border-media-foreground/10 bg-media/50 text-media-foreground/60",
                        )}
                      >
                        {stateLabel}
                      </span>
                    </div>
                    {showTileText && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media/80 via-media/45 to-transparent p-1.5 pt-5">
                        <div className="truncate text-[10px] font-medium leading-3 text-media-foreground/90">
                          {asset.label}
                        </div>
                        {tileDetail && (
                          <div className="truncate text-[9px] leading-3 text-media-foreground/50">
                            {tileDetail}
                          </div>
                        )}
                      </div>
                    )}
                    {hasTileActions && (
                      <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/reference-tile:opacity-100 group-focus-within/reference-tile:opacity-100">
                        {asset.can_crop && asset.media_type === "image" && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={TILE_ACTION_CLASS}
                            aria-label={t(
                              "episode.workbench.video.seedance2AssetCrop",
                            )}
                            onClick={() =>
                              controller.openCrop({
                                asset,
                                target: seedance2CropTargetForAsset(mode, asset),
                              })
                            }
                          >
                            <Scissors className="size-3.5" />
                          </Button>
                        )}
                        {asset.can_trim && asset.media_type === "audio" && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={TILE_ACTION_CLASS}
                            aria-label={t(
                              "episode.workbench.video.seedance2AssetCrop",
                            )}
                            data-ui-tooltip={t(
                              "episode.workbench.video.seedance2AssetAudioTrim",
                            )}
                            onClick={() => controller.openTrim(asset)}
                          >
                            <Scissors className="size-3.5" />
                          </Button>
                        )}
                        {asset.can_delete && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={controller.deletePending}
                            className="size-5 rounded-[5px] border border-media-foreground/10 bg-media/35 text-media-foreground/60 hover:bg-destructive/15 hover:text-destructive"
                            aria-label={t(
                              "episode.workbench.video.seedance2AssetDelete",
                            )}
                            onClick={() => void controller.deleteAsset(asset)}
                          >
                            <Trash2 className="size-2.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyReferences />
          )}
          {problemAssets.length > 0 && (
            <div
              role="alert"
              className="mt-3 flex gap-2 rounded-[8px] border border-destructive/30 bg-destructive/[0.06] p-2.5 text-xs text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0 space-y-1">
                <div className="font-medium">
                  {t("episode.workbench.video.seedance2ReferenceProblemTitle")}
                </div>
                {problemAssets.map((asset) => (
                  <div key={asset.key} className="break-words text-[11px]">
                    {t("episode.workbench.video.seedance2ReferenceProblemItem", {
                      label: asset.label,
                      detail:
                        asset.validation_error ||
                        asset.status_detail ||
                        t("episode.workbench.video.seedance2ReferenceMissing"),
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
