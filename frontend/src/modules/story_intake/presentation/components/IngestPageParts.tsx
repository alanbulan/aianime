// Copyright (c) 2026 AI anime
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { CreditCostInline } from "@/components/credit-cost-inline";
import { useCreditDisplayHidden } from "@/components/credits/credit-visual";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { isCeRuntime } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";
import type {
  IngestFileStatus,
  InputMode,
} from "@/modules/story_intake/domain/ingestion";
import type { FormatCheck } from "@/modules/story_intake/domain/types";

const COMPACT_SELECT_TRIGGER_CLASS =
  "h-8 w-full rounded-[8px] border-border bg-transparent px-2.5 text-xs md:w-auto md:min-w-max";
const COMPACT_SELECT_CONTENT_CLASS =
  "min-w-max rounded-md border border-border bg-popover p-1 shadow-xl data-[align-trigger=true]:animate-in [&_[data-slot=select-item]]:min-h-8 [&_[data-slot=select-item]]:rounded-sm [&_[data-slot=select-item]]:px-2 [&_[data-slot=select-item]]:py-1.5 [&_[data-slot=select-item]]:text-xs [&_[data-slot=select-item]:focus]:bg-muted [&_[data-slot=select-item]:focus]:text-current [&_[data-slot=select-item]_svg]:size-3.5";
const INGEST_SURFACE_CLASS = "border-border bg-card shadow-none";
const INGEST_SURFACE_SUBTLE_CLASS = "border-border bg-muted shadow-none";
const INGEST_DIVIDER_CLASS = "border-border";

// ─── helpers ─────────────────────────────────────────────────────────────────

function resolveOptionLabel(
  options: { value: string; labelKey?: string; label?: string }[],
  value: string,
  t: (key: string) => string,
): string | undefined {
  const option = options.find((o) => o.value === value);
  if (!option) return undefined;
  return option.label ?? (option.labelKey ? t(option.labelKey) : undefined);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function splitFilename(filename: string): { name: string; extension: string } {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return { name: filename, extension: "FILE" };
  }
  return {
    name: filename.slice(0, dotIndex),
    extension: filename.slice(dotIndex).toUpperCase(),
  };
}

// ─── subcomponents ───────────────────────────────────────────────────────────

function UploadZone({
  onFile,
  pending,
  className,
}: {
  onFile: (file: File) => void;
  pending: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-5 rounded-lg px-6 py-16 text-center transition-colors sm:flex-row sm:gap-8 sm:text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        dragging ? "bg-muted" : "hover:bg-muted",
        className,
      )}
    >
      <div className="flex h-[72px] w-14 -rotate-[6deg] items-center justify-center rounded-[10px] bg-muted text-muted-foreground transition-all duration-300 ease-out group-hover:rotate-0 group-hover:bg-accent">
        <Plus className="size-7 stroke-[1.25px]" />
      </div>
      <div className="space-y-1.5 sm:-mt-1">
        <p className="text-lg font-medium tracking-tight text-foreground">
          {t("ingest.dropzoneHint")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("ingest.supportedFormats")}
        </p>
        {pending && (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".txt,.md,.docx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

// 全屏上传遮罩：网络慢时上传还在飞、用户一切菜单就卸载本页，upload 的 onSuccess
// 便写不进 chapters 缓存，回来「刚上传的小说」就消失了。用 fixed inset-0 z-[1000]
// 盖住整屏（含顶部菜单），上传期间挡住导航，逼用户等上传落地再离开。
function UploadingOverlay() {
  const { t } = useTranslation();
  return (
    <div
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
      aria-label={t("ingest.uploadingTitle")}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 px-6 text-foreground backdrop-blur-md"
    >
      <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-2xl shadow-black/30">
        <div className="relative mb-6 flex size-14 items-center justify-center">
          <span
            className="absolute inset-0 animate-ping rounded-full bg-primary/10"
            aria-hidden="true"
          />
          <span
            className="absolute inset-0 rounded-full bg-primary/10"
            aria-hidden="true"
          />
          <Loader2
            className="relative size-7 animate-spin text-primary"
            aria-hidden="true"
          />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          {t("ingest.uploadingTitle")}
        </h2>
        <p className="mt-2.5 max-w-[17rem] text-[13px] leading-6 text-muted-foreground">
          {t("ingest.uploadingHint")}
        </p>
      </div>
    </div>
  );
}

// 格式风险常驻警告：文件在则警告在，替代一闪而过的 toast.warning。
// boxed = 富卡片里的琥珀色警告条；plain = 上传表单提示行里的一行轻量文字。
function FormatCheckWarning({
  formatCheck,
  onViewDetails,
  variant = "boxed",
  className,
}: {
  formatCheck: FormatCheck;
  onViewDetails?: () => void;
  variant?: "boxed" | "plain";
  className?: string;
}) {
  const { t } = useTranslation();
  const detailsButton = onViewDetails && (
    <button
      type="button"
      onClick={onViewDetails}
      className={cn(
        "ml-1.5 whitespace-nowrap font-medium underline underline-offset-2 transition-colors",
        "text-foreground/80 hover:text-foreground",
      )}
    >
      {t("aiAssistant.formatCheck.viewDetails")}
    </button>
  );

  if (variant === "plain") {
    return (
      <div className={cn("flex items-start gap-1.5", className)}>
        <AlertTriangle className="mt-px size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <span>{formatCheck.summary || t("aiAssistant.formatCheck.title")}</span>
          {detailsButton}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 text-xs leading-5 text-foreground/70">
        <span>{formatCheck.summary || t("aiAssistant.formatCheck.title")}</span>
        {detailsButton}
      </div>
    </div>
  );
}

function UploadedFileCard({
  filename,
  size,
  status,
  progress,
  currentTask,
  error,
  formatCheck,
  onViewFormatCheck,
  isIngesting,
  canStart,
  isStarting,
  ingestCostDisplay,
  onStart,
  onCancel,
  isCancelling,
  onReupload,
  onDelete,
}: {
  filename: string;
  size: number | null;
  status: IngestFileStatus;
  progress: number;
  currentTask: string;
  error: string | null;
  formatCheck?: FormatCheck | null;
  onViewFormatCheck?: () => void;
  isIngesting: boolean;
  canStart: boolean;
  isStarting: boolean;
  ingestCostDisplay?: string | null;
  onStart: () => void;
  onCancel: () => void;
  isCancelling: boolean;
  onReupload: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const percent = Math.round(progress * 100);
  // 导入完成后风险提示已无行动价值，只在导入前/失败/中止时常驻展示。
  const showFormatWarning =
    formatCheck?.level === "warning" && status !== "completed";
  const statusStyles: Record<IngestFileStatus, string> = {
    uploaded: "border-primary/30 bg-primary/10 text-primary",
    importing: "border-primary/30 bg-primary/10 text-primary",
    completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    stopped: "border-muted-foreground/35 bg-muted text-muted-foreground",
    failed: "border-destructive/35 bg-destructive/10 text-destructive",
  };
  const statusIcon =
    status === "importing" ? (
      <Loader2 className="size-2.5 animate-spin" />
    ) : status === "failed" ? (
      <AlertTriangle className="size-2.5" />
    ) : status === "stopped" ? (
      <Square className="size-2.5" />
    ) : (
      <CheckCircle2 className="size-2.5" />
    );

  return (
    <div className={cn("rounded-lg border p-4", INGEST_SURFACE_CLASS)}>
      <div className="flex items-center gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileText className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {filename}
            </p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-medium leading-4",
                statusStyles[status],
              )}
            >
              {statusIcon}
              {t(`ingest.status.${status}`)}
            </span>
          </div>
          {size != null && (
            <div className="mt-1 text-xs text-muted-foreground">
              {formatSize(size)}
            </div>
          )}
          {status === "failed" && error && (
            <p className="mt-2 text-xs leading-5 text-destructive">
              {error}
            </p>
          )}
          {showFormatWarning && formatCheck && (
            <FormatCheckWarning
              formatCheck={formatCheck}
              onViewDetails={onViewFormatCheck}
              className="mt-2"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isIngesting ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isCancelling}
              className="gap-1.5"
            >
              {isCancelling ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Square className="size-3.5" />
              )}
              {t("common.stop")}
            </Button>
          ) : (
            <>
              {canStart && (
                <Button
                  size="sm"
                  onClick={onStart}
                  disabled={isStarting}
                  className="gap-1.5"
                >
                  {isStarting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5 fill-current" />
                  )}
                  {isStarting ? t("ingest.processing") : t("ingest.startIngest")}
                  <CreditCostInline display={ingestCostDisplay} />
                </Button>
              )}
              {/* 导入完成后去掉「重新上传」「删除」：已导入的小说不再允许就地换文件
                  或删除，避免误操作覆盖/清掉已建好的图谱；未导入（uploaded/stopped/
                  failed）时保留这两个入口。 */}
              {status !== "completed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReupload}
                  className="gap-1.5"
                >
                  <RefreshCw className="size-3.5" />
                  {t("common.reupload")}
                </Button>
              )}
              {status !== "completed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                  {t("common.delete")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {isIngesting && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {currentTask || t("ingest.processing")}
            </span>
            <span className="shrink-0 font-mono tabular-nums">{percent}%</span>
          </div>
          <Progress value={percent} />
        </div>
      )}
    </div>
  );
}

function SelectedFileCard({
  filename,
  error,
  onDelete,
}: {
  filename: string;
  error: string | null;
  onDelete: () => void;
}) {
  const { name, extension } = splitFilename(filename);

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="relative w-full max-w-[320px] rounded-lg bg-sky-500/20 px-5 py-4 pr-12 text-left">
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove selected file"
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
        >
          <X className="size-3" />
        </button>
        <p
          className="truncate text-sm font-medium text-foreground"
          title={name}
        >
          {name}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-4 text-sky-700 dark:text-sky-300" />
          <span>{extension}</span>
        </div>
        {error && (
          <p className="mt-3 text-xs leading-5 text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function InputModeToggle({
  value,
  onChange,
  className,
}: {
  value: InputMode;
  onChange: (value: InputMode) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const options: { value: InputMode; label: string }[] = [
    { value: "upload", label: t("ingest.inputMode.upload") },
    { value: "paste", label: t("ingest.inputMode.paste") },
  ];

  return (
    <div
      className={cn(
        "inline-flex h-8 items-center rounded-[8px] border border-border bg-transparent p-1 text-xs",
        className,
      )}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "h-6 flex-1 rounded-[6px] px-2.5 text-xs font-normal leading-none transition-colors md:flex-none",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function IngestStartButton({
  disabled,
  isBusy,
  costDisplay,
  onClick,
}: {
  disabled: boolean;
  isBusy: boolean;
  costDisplay?: string | null;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-[124px] rounded-[8px] bg-primary px-0 text-xs font-normal text-primary-foreground shadow-none transition-colors hover:bg-primary/85 active:bg-primary/75"
    >
      <span className="grid w-full grid-cols-[12px_52px_26px] items-center justify-center gap-1.5">
        <Play className="size-3 fill-current" />
        <span className="text-center">
          {isBusy ? t("ingest.processing") : t("ingest.startIngest")}
        </span>
        <IngestCreditCostSlot display={costDisplay} />
      </span>
    </Button>
  );
}

const IngestCreditCostSlot = memo(function IngestCreditCostSlot({
  display,
}: {
  display?: string | null;
}) {
  const hidden = useCreditDisplayHidden() || isCeRuntime() || !display;
  return (
    <span className="flex h-4 w-[26px] items-center justify-center overflow-hidden">
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex w-[26px] items-center justify-center gap-0.5 text-[11px] font-medium leading-none tabular-nums text-primary-foreground",
          hidden && "invisible",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-3 shrink-0 text-primary-foreground"
          aria-hidden="true"
        >
          <path
            d="M12 2.6l2.16 6.28L20.4 11l-6.24 2.12L12 19.4l-2.16-6.28L3.6 11l6.24-2.12L12 2.6Z"
            fill="currentColor"
          />
          <path
            d="M18.1 16.2l.72 1.98 1.98.72-1.98.72-.72 1.98-.72-1.98-1.98-.72 1.98-.72.72-1.98Z"
            fill="currentColor"
            opacity="0.78"
          />
          <path
            d="M7.2 3.3l.44 1.18 1.18.44-1.18.44-.44 1.18-.44-1.18-1.18-.44 1.18-.44.44-1.18Z"
            fill="currentColor"
            opacity="0.72"
          />
        </svg>
        <span className="min-w-[8px] text-center">{display ?? "0"}</span>
      </span>
    </span>
  );
});

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border p-4", INGEST_SURFACE_CLASS)}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>
      <p
        className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground"
        style={{ fontFeatureSettings: '"cv01", "ss03", "tnum"' }}
      >
        {value}
      </p>
    </div>
  );
}

function ChapterPreviewSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("common.loading")}
      className="space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          {t("ingest.previewHeading")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("ingest.previewGenerating")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn("rounded-lg border p-4", INGEST_SURFACE_CLASS)}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-24" />
          </div>
        ))}
      </div>

      <div className={cn("overflow-hidden rounded-lg border", INGEST_SURFACE_SUBTLE_CLASS)}>
        <div className={cn("grid grid-cols-[4rem_1fr_5rem] items-center gap-2 border-b px-4 py-2.5", INGEST_DIVIDER_CLASS)}>
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-10" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[4rem_1fr_5rem] items-center gap-2 px-4 py-2.5"
            >
              <Skeleton className="h-3 w-4" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="ml-auto h-3 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KnowledgeGraphSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("common.loading")}
      className="h-[520px] overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-40" />
        </div>
      </div>
      <div className="flex h-[430px] items-center justify-center bg-muted/35">
        <Skeleton className="size-64 rounded-full opacity-45" />
      </div>
    </div>
  );
}


export {
  ChapterPreviewSkeleton,
  COMPACT_SELECT_CONTENT_CLASS,
  COMPACT_SELECT_TRIGGER_CLASS,
  FormatCheckWarning,
  INGEST_DIVIDER_CLASS,
  INGEST_SURFACE_CLASS,
  INGEST_SURFACE_SUBTLE_CLASS,
  IngestStartButton,
  InputModeToggle,
  KnowledgeGraphSkeleton,
  SelectedFileCard,
  StatCard,
  UploadedFileCard,
  UploadingOverlay,
  UploadZone,
  resolveOptionLabel,
};
