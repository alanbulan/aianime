// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function collectKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale translation files", () => {
  it.each(["en", "zh"])("%s translation JSON is valid", (language) => {
    const content = readFileSync(`public/locales/${language}/translation.json`, "utf8");

    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("keeps zh and en translation key sets aligned", () => {
    const zh = JSON.parse(readFileSync("public/locales/zh/translation.json", "utf8"));
    const en = JSON.parse(readFileSync("public/locales/en/translation.json", "utf8"));
    const zhKeys = new Set(collectKeys(zh));
    const enKeys = new Set(collectKeys(en));

    expect([...zhKeys].filter((key) => !enKeys.has(key)).sort()).toEqual([]);
    expect([...enKeys].filter((key) => !zhKeys.has(key)).sort()).toEqual([]);
  });

  it("uses the requested custom prompt label for VideoReference guidance in Chinese", () => {
    const content = readFileSync("public/locales/zh/translation.json", "utf8");
    const translations = JSON.parse(content);

    expect(translations.episode.workbench.video.videoReferencePromptGuidance).toBe("自定义提示词");
  });

  it("labels VideoReference text-only reference fallbacks as missing reference images in Chinese", () => {
    const content = readFileSync("public/locales/zh/translation.json", "utf8");
    const translations = JSON.parse(content);

    expect(translations.episode.workbench.video.videoReferenceFallback).toBe("缺参考图");
  });

  it("uses the requested default project queue full toast in Chinese", () => {
    const content = readFileSync("public/locales/zh/translation.json", "utf8");
    const translations = JSON.parse(content);

    expect(translations.common.projectDefaultQueueFull).toBe(
      "当前项目默认队列已满",
    );
  });

  it("defines project queue kind labels in Chinese", () => {
    const content = readFileSync("public/locales/zh/translation.json", "utf8");
    const translations = JSON.parse(content);

    expect(translations.common.projectQueueKinds).toMatchObject({
      workflow: "工作流编排",
      video: "视频",
      world: "世界",
      ffmpeg: "合成",
    });
  });

  it("defines 3D director labels used without default values", () => {
    const zh = JSON.parse(readFileSync("public/locales/zh/translation.json", "utf8"));
    const en = JSON.parse(readFileSync("public/locales/en/translation.json", "utf8"));
    const keys = [
      "currentBackgroundSource",
      "downstreamCurrentBackground",
      "shapeHint",
      "saveScene",
      "clearScene",
      "saveSceneTemplate",
      "clearSceneTemplate",
      "saveCanvasDraft",
      "clearCanvasDraft",
      "controlProxyHint",
    ];

    for (const language of [zh, en]) {
      for (const key of keys) {
        expect(language.viewer.threeD[key]).toEqual(expect.any(String));
        expect(language.viewer.threeD[key].length).toBeGreaterThan(0);
      }
    }
  });
});
