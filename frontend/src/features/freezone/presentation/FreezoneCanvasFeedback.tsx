// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CanvasBackupStatus } from "@/features/freezone/domain/canvasStorage";

import type { ConflictSnapshot } from "../application/canvasSyncStorage";

export function FreezoneToast({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-1/2 top-6 z-40 max-w-md -translate-x-1/2 rounded-lg border border-border-default bg-surface/95 px-4 py-2 text-sm text-text shadow-xl backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="break-words flex-1 min-w-0">{text}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function CanvasConflictOverlay({
  error,
  canvasId,
  onRefresh,
  onSaveCopy,
  readConflictSnapshot,
}: {
  error: string | null;
  canvasId: string;
  onRefresh: () => void;
  onSaveCopy: () => Promise<void>;
  readConflictSnapshot: () => ConflictSnapshot | null;
}) {
  const { t } = useTranslation();
  const [savingCopy, setSavingCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  // Read once on mount so the download button always uses the snapshot
  // captured when the 409 fired, even if a later save rewrites storage.
  const snapshot = useMemo(() => readConflictSnapshot(), [readConflictSnapshot]);

  const handleDownload = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const stamp = snapshot.timestamp
      ? snapshot.timestamp.replace(/[:.]/g, "-")
      : new Date().toISOString().replace(/[:.]/g, "-");
    anchor.download = `freezone-${canvasId}-conflict-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-scrim">
      <div className="flex max-w-md flex-col gap-3 rounded-lg border border-warning/45 bg-card px-4 py-3 text-sm text-card-foreground shadow-lg">
        <div className="font-medium">画布保存冲突</div>
        <div className="text-text-muted">
          {error ?? "画布已被其他窗口或用户修改。刷新会丢弃当前本地未保存修改，另存为副本会保留当前画布。"}
        </div>
        {snapshot && (
          <div className="text-[11px] text-text-muted/80">
            本地未保存修改已暂存到浏览器，可下载备份后再决定是否刷新。
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md border border-warning/40 px-3 py-1 text-warning transition-colors hover:bg-warning/10"
          >
            刷新
          </button>
          <button
            type="button"
            disabled={savingCopy || !snapshot}
            onClick={() => {
              setSavingCopy(true);
              setCopyError(null);
              onSaveCopy()
                .catch((err) => {
                  setCopyError(err instanceof Error ? err.message : String(err));
                })
                .finally(() => setSavingCopy(false));
            }}
            className="rounded-md border border-primary/45 bg-primary px-3 py-1 text-primary-foreground shadow-none transition-colors hover:bg-primary/90 disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            title={snapshot ? undefined : t("freezone.canvases.noConflictSnapshot")}
          >
            {savingCopy ? "保存中..." : "另存为副本"}
          </button>
          {snapshot && (
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-md border border-[var(--ui-border-soft)] px-3 py-1 text-text transition-colors hover:bg-muted"
              title={`下载本地修改快照（${snapshot.nodes.length} 节点 · ${snapshot.edges.length} 连线）`}
            >
              下载本地 JSON
            </button>
          )}
        </div>
        {copyError && (
          <div className="text-[11px] text-destructive">
            {copyError}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Lightweight indicator for the backend's `backup_status` channel. Only
 * renders for `pending` (still uploading to OSS) and `failed` (local save is
 * durable but OSS replication did not stick); `synced` / `disabled` / `null`
 * stay silent so the canvas does not gain chrome for the happy path.
 *
 * The badge floats above ReactFlow's bottom-right zoom controls
 * (`bottom-3 right-3` is taken by `MiniMap`; the offset puts us just
 * above it without overlapping).
 */
export function BackupStatusIndicator({
  status,
}: {
  status: CanvasBackupStatus | null;
}) {
  if (status !== "pending" && status !== "failed") {
    return null;
  }
  const isFailed = status === "failed";
  const label = isFailed ? "云端备份失败" : "云端备份中";
  const detail = isFailed
    ? "本地修改已保存，但云端备份未完成。请保留页面，稍后会自动重试。"
    : "本地修改已保存，云端备份还在同步中。可以继续编辑。";
  const palette = isFailed
    ? "border-destructive/45 bg-destructive/10 text-destructive"
    : "border-warning/40 bg-warning/10 text-warning";
  const dot = isFailed ? "bg-destructive" : "bg-warning animate-pulse";
  return (
    <div
      role={isFailed ? "alert" : "status"}
      className={`absolute bottom-16 right-3 z-30 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-none shadow-sm ${palette}`}
      title={detail}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

export function CanvasLoadingScreen() {
  return (
    <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
      正在加载画布...
    </div>
  );
}

export function CanvasLoadingOverlay() {
  // hydrate 还在飞时画布上的编辑既不会入队保存，也会被随后的 setCanvasData(remote)
  // 整个盖掉。所以这层遮罩必须真的吃掉指针事件，不能只是视觉上蒙一层。
  return (
    <div
      className="absolute inset-0 z-20 cursor-wait bg-background/70 backdrop-blur-[1px]"
      aria-hidden="true"
    />
  );
}

export function CanvasErrorOverlay({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-scrim px-6">
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-destructive/30 bg-card/95 px-4 py-3 text-sm shadow-xl backdrop-blur-xl">
        <div className="font-medium text-destructive">画布同步失败</div>
        <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
          {error}
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:border-destructive/55 hover:bg-destructive/20"
        >
          重试
        </button>
      </div>
    </div>
  );
}
