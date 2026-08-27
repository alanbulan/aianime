// Copyright (c) 2026 AI anime
import type { TFunction } from "i18next";

export interface GeneratedAgeLabel {
  label: string;
  tooltip: string;
}
/**
 * Compact relative-time formatter for pool-image captions.
 *
 * Output examples:
 *   < 1 min   → "5s"       (integer seconds)
 *   < 1 hour  → "2m"       (integer minutes)
 *   < 1 day   → "5.2h"     (one decimal hours)
 *   ≥ 1 day   → "1.3d"     (one decimal days)
 *
 * Returns null for nullish / invalid inputs so callers can skip rendering.
 */
export function formatCompactAge(
  iso: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;

  const diffSec = Math.max(0, Math.round((now - t) / 1000));
  if (diffSec < 60) return `${diffSec}s`;

  const diffMin = diffSec / 60;
  if (diffMin < 60) return `${Math.floor(diffMin)}m`;

  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${(Math.floor(diffHr * 10) / 10).toFixed(1)}h`;

  const diffDay = diffHr / 24;
  return `${(Math.floor(diffDay * 10) / 10).toFixed(1)}d`;
}

/**
 * Formats a media generation timestamp for narrow candidate thumbnails.
 *
 * The visible label uses completed whole hours/days so it stays on one line;
 * the tooltip retains the one-decimal detail produced by formatCompactAge.
 */
export function formatGeneratedAgeLabel(
  iso: string | null | undefined,
  t: TFunction,
  now: number = Date.now(),
): GeneratedAgeLabel | null {
  const compactAge = formatCompactAge(iso, now);
  if (!compactAge) return null;

  const unit = compactAge.slice(-1);
  const rawValue = compactAge.slice(0, -1);
  const unitKey =
    unit === "s"
      ? "second"
      : unit === "m"
        ? "minute"
        : unit === "h"
          ? "hour"
          : unit === "d"
            ? "day"
            : null;
  if (!unitKey) return null;

  const numericValue = Number(rawValue);
  const detailedValue = rawValue.replace(/\.0$/, "");
  const visibleValue =
    (unit === "h" || unit === "d") && Number.isFinite(numericValue)
      ? String(Math.max(1, Math.floor(numericValue)))
      : detailedValue;
  const labelKey = `common.generatedAgo.${unitKey}`;
  const label = t(labelKey, { value: visibleValue });
  const detailedLabel = t(labelKey, { value: detailedValue });

  return {
    label,
    tooltip: t("common.generatedAgo.tooltip", { time: detailedLabel }),
  };
}
