// Copyright (c) 2026 AI anime

export function formatPreciseMediaTime(
  seconds: number,
  totalDuration = seconds,
): string {
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const safeDuration =
    Number.isFinite(totalDuration) && totalDuration > 0 ? totalDuration : 0;

  if (safeDuration < 1) return `${safeSeconds.toFixed(3)}s`;
  if (safeDuration < 60) return `${safeSeconds.toFixed(2)}s`;

  const minutes = Math.floor(safeSeconds / 60);
  const secondsInMinute = safeSeconds - minutes * 60;
  return `${minutes}:${secondsInMinute.toFixed(2).padStart(5, "0")}`;
}
