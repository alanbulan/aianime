// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("compose export API alignment", () => {
  it("uses /export/video for final video and POST /export/zip for zip export", () => {
    const gateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );

    expect(gateway).toContain("/export/video");
    expect(gateway).toContain('if (kind === "zip")');
    expect(gateway).toContain("api");
    expect(gateway).toContain(".post(");
    expect(gateway).toContain("/export/zip");
    expect(gateway).not.toContain("export/${kind}");
  });

  it("keeps the BGM option connected from the view to the compose request", () => {
    const view = read(
      "src/modules/production/presentation/EpisodeComposePageView.tsx",
    );
    const gateway = read(
      "src/modules/production/infrastructure/http-production-video-gateway.ts",
    );

    expect(gateway).toContain("add_bgm: command.addBgm");
    expect(view).toContain("handleAddBgmChange");
    expect(view).toContain('t("video.addBgm")');
  });

  it("hydrates and persists NiceGUI compose preferences from project config", () => {
    const controller = read(
      "src/modules/production/application/use-episode-compose-page-controller.ts",
    );

    expect(controller).toContain("queries.useProject(project)");
    expect(controller).toContain("queries.useUpdateProject(project)");
    expect(controller).toContain("projectConfig?.video_resolution");
    expect(controller).toContain("projectConfig?.add_subtitles");
    expect(controller).toContain("projectConfig?.add_bgm");
    expect(controller).toContain("video_resolution: next");
    expect(controller).toContain("add_subtitles: next");
    expect(controller).toContain("add_bgm: next");
  });

  it("keeps compose blocker copy fully localized", () => {
    const view = read(
      "src/modules/production/presentation/EpisodeComposePageView.tsx",
    );
    const zh = read("public/locales/zh/translation.json");
    const en = read("public/locales/en/translation.json");

    expect(view).toContain('t("episode.compose.blockerCount"');
    expect(view).toContain('t("episode.compose.blockerSubtitle"');
    expect(view).toContain('t("episode.compose.missingItems"');
    expect(view).toContain('t("episode.compose.beatLabel")');
    expect(view).not.toContain(">Beat<");

    for (const locale of [zh, en]) {
      expect(locale).toContain('"blockerCount"');
      expect(locale).toContain('"blockerSubtitle"');
      expect(locale).toContain('"missingItemSeparator"');
      expect(locale).toContain('"missingItems"');
      expect(locale).toContain('"beatLabel"');
    }
  });
});
