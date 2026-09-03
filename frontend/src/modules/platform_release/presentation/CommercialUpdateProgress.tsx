import { useTranslation } from "react-i18next";

import { TaskProgress } from "@/components/task-progress";
import type { CommercialUpdateDownloadProgress } from "@/modules/platform_release/composition";

export function CommercialUpdateProgressView({
  progress,
  status = 'running',
  startedAt,
}: {
  progress: CommercialUpdateDownloadProgress | null;
  status?: 'running' | 'finalizing' | 'failed';
  startedAt?: number | null;
}) {
  const { t } = useTranslation();
  const transferred = formatBytes(progress?.transferred ?? 0);
  const speed = formatBytes(progress?.bytesPerSecond ?? 0);
  const detail = progress && progress.total > 0
    ? t("app.commercialUpdate.downloadProgress", {
        transferred,
        total: formatBytes(progress.total),
        speed,
      })
    : t("app.commercialUpdate.downloadProgressUnknownTotal", {
        transferred,
        speed,
      });

  return (
    <div className="space-y-2" aria-live="polite">
      <TaskProgress local startedAt={startedAt} task={{ status, progress: (progress?.percent ?? 0) / 100 }} aria-label={detail} />
      <p className="text-center text-[11px] tabular-nums text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
