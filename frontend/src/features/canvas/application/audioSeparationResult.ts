// Copyright (c) 2026 AI anime
export interface CanvasAudioSeparationOutputs {
  readonly audioUrl: string | null;
  readonly silentVideoUrl: string | null;
}

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    if (value.length > 0) output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, output);
    }
  }
}

function toStaticUrl(raw: string): string {
  if (
    raw.startsWith("/static/") ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:")
  ) {
    return raw;
  }
  const outputIndex = raw.lastIndexOf("/output/");
  return outputIndex >= 0
    ? `/static/${raw.slice(outputIndex + "/output/".length)}`
    : raw;
}

function pickUrlField(
  source: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function resolveCanvasAudioSeparationOutputs(
  result: Record<string, unknown> | null | undefined,
): CanvasAudioSeparationOutputs {
  if (!result) return { audioUrl: null, silentVideoUrl: null };

  // Canonical API URLs win; filesystem paths are considered only by fallback.
  let audioUrl = pickUrlField(result, ["audio_url", "audioUrl"]);
  let silentVideoUrl = pickUrlField(result, [
    "mute_video_url",
    "muteVideoUrl",
  ]);

  if (!audioUrl || !silentVideoUrl) {
    const strings: string[] = [];
    collectStrings(result, strings);
    // Prefer already-servable values before considering legacy output paths.
    const isServable = (value: string) =>
      value.startsWith("/static/") ||
      value.startsWith("http://") ||
      value.startsWith("https://");
    strings.sort(
      (left, right) => Number(isServable(right)) - Number(isServable(left)),
    );
    const audioExtension = /\.(mp3|m4a|aac|wav|flac|ogg|opus)(\?|$)/i;
    const videoExtension = /\.(mp4|mov|webm|mkv|avi|m4v)(\?|$)/i;
    for (const value of strings) {
      if (
        !audioUrl &&
        (audioExtension.test(value) || /audio|sound/i.test(value))
      ) {
        audioUrl = value;
      } else if (
        !silentVideoUrl &&
        (videoExtension.test(value) ||
          /silent|mute|no[_-]?audio|video/i.test(value))
      ) {
        silentVideoUrl = value;
      }
      if (audioUrl && silentVideoUrl) break;
    }
  }

  return {
    audioUrl: audioUrl ? toStaticUrl(audioUrl) : null,
    silentVideoUrl: silentVideoUrl ? toStaticUrl(silentVideoUrl) : null,
  };
}
