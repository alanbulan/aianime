import { useTranslation } from "react-i18next";

import { Progress } from "@/components/ui/progress";
import type { CommercialUpdateDownloadProgress } from "@/modules/platform_release/composition";

export function CommercialUpdateProgressView({
  progress,
}: {
  progress: CommercialUpdateDownloadProgress | null;
}) {
  const { t } = useTranslation();
  if (!progress) return null;

  const percent = Math.round(progress.percent);
  const transferred = formatBytes(progress.transferred);
  const speed = formatBytes(progress.bytesPerSecond);
  const detail = progress.total > 0
    ? t("app.commercialUpdate.downloadProgress", {
        percent,
        transferred,
        total: formatBytes(progress.total),
        speed,
      })
    : t("app.commercialUpdate.downloadProgressUnknownTotal", {
        percent,
        transferred,
        speed,
      });

  return (
    <div className="space-y-2" aria-live="polite">
      <Progress value={percent} aria-label={detail} />
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
