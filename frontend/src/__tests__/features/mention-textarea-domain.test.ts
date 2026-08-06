// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  buildMentionSegments,
  detectMentionQuery,
  filterMentionLabels,
  insertMentionText,
  mentionPreviewPosition,
  replaceMentionText,
} from "@/modules/mention_textarea/public";

describe("mention textarea domain", () => {
  it("segments known mentions with longest-label matching", () => {
    expect(
      buildMentionSegments("看向@青桐_少女时期继续", [
        "青桐_少女",
        "青桐_少女时期",
      ]),
    ).toEqual([
      { text: "看向", mention: false },
      { text: "@青桐_少女时期", mention: true },
      { text: "继续", mention: false },
    ]);
  });

  it("detects an active mention and filters its candidates", () => {
    const mention = detectMentionQuery("画面，@图", 5);
    expect(mention).toEqual({ start: 3, end: 5, query: "图" });
    expect(
      filterMentionLabels(
        ["图片1", "音频1", "图片2"],
        mention?.query ?? null,
        false,
      ),
    ).toEqual(["图片1", "图片2"]);
  });

  it("inserts and replaces mentions with stable caret positions", () => {
    expect(
      insertMentionText("参考 @图   收尾", {
        start: 3,
        end: 5,
        query: "图",
      }, "图片1"),
    ).toEqual({ value: "参考 @图片1 收尾", caret: 8 });
    expect(
      replaceMentionText(
        "参考 @图片1 收尾",
        { start: 3, end: 7 },
        "图片2",
      ),
    ).toEqual({ value: "参考 @图片2 收尾", caret: 7 });
  });

  it("keeps previews inside the horizontal viewport", () => {
    expect(
      mentionPreviewPosition(
        { left: 980, top: 300 },
        { width: 1024, height: 768 },
        200,
      ),
    ).toEqual({ left: 816, bottom: 474 });
  });
});
