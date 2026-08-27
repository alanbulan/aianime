// Copyright (c) 2026 AI anime
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");
const MEDIA_CONTROL_FILES = [
  "components/media/PreciseAudioPlayer.tsx",
  "components/media/UnifiedVideoPlayer.tsx",
  "modules/production/presentation/VideoPaneParts.tsx",
  "modules/creative_canvas/presentation/CoverEditor.tsx",
  "modules/creative_canvas/presentation/VideoComposeModalView.tsx",
  "modules/creative_canvas/presentation/VideoComposeTimelineControls.tsx",
  "modules/creative_canvas/presentation/VideoConfigChip.tsx",
  "modules/creative_canvas/presentation/VideoPlayerControls.tsx",
  "modules/creative_canvas/presentation/VideoViewerModal.tsx",
] as const;

function sourceComponentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceComponentFiles(path);
    if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) {
      return [];
    }
    return [path];
  });
}

describe("媒体控件架构边界", () => {
  it("所有可见音视频播放器均禁用浏览器原生 controls", () => {
    const violations = sourceComponentFiles(SRC_ROOT).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /<(?:audio|video)\b[^>]*\bcontrols(?=\s|=|\/>|>)/gs.test(source)
        ? [relative(SRC_ROOT, path).replace(/\\/g, "/")]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("媒体播放与视频编辑控件统一使用 UI Slider", () => {
    const violations = MEDIA_CONTROL_FILES.filter((path) => {
      const source = readFileSync(resolve(SRC_ROOT, path), "utf8");
      return /<input\b[^>]*type=["']range["']/gs.test(source);
    });

    expect(violations).toEqual([]);
  });
});
