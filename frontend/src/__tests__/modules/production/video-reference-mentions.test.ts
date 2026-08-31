// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  buildVideoReferenceLabelIdentityMaps,
  findVideoReferenceTrailingMention,
  getVideoReferenceMentionQuery,
  remapVideoReferenceMentions,
  sameVideoReferenceLabelIdentity,
  type VideoReferenceAssetLike,
} from "@/modules/production/domain/video-reference-mentions";

const asset = (
  reference_label: string,
  url: string,
): VideoReferenceAssetLike => ({ reference_label, url, key: url });

const maps = (assets: VideoReferenceAssetLike[]) =>
  buildVideoReferenceLabelIdentityMaps(assets);

describe("remapVideoReferenceMentions", () => {
  it("renumbers a mention when an earlier asset is deleted", () => {
    const prev = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const next = maps([asset("图片1", "B")]);
    expect(remapVideoReferenceMentions("用 @图片2 收尾", prev, next)).toBe(
      "用 @图片1 收尾",
    );
  });

  it("drops a mention whose asset was removed with its trailing space", () => {
    const prev = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const next = maps([asset("图片1", "B")]);
    expect(remapVideoReferenceMentions("先 @图片1 再 @图片2 收尾", prev, next)).toBe(
      "先 再 @图片1 收尾",
    );
  });

  it("follows assets through a reorder", () => {
    const prev = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const next = maps([asset("图片1", "B"), asset("图片2", "A")]);
    expect(remapVideoReferenceMentions("@图片1 和 @图片2", prev, next)).toBe(
      "@图片2 和 @图片1",
    );
  });

  it("remaps image and audio families independently", () => {
    const prev = maps([
      asset("图片1", "i1"),
      asset("图片2", "i2"),
      asset("音频1", "a1"),
      asset("音频2", "a2"),
    ]);
    const next = maps([asset("图片1", "i2"), asset("音频1", "a2")]);
    expect(remapVideoReferenceMentions("看 @图片2 听 @音频2", prev, next)).toBe(
      "看 @图片1 听 @音频1",
    );
  });

  it("leaves unknown labels untouched", () => {
    const prev = maps([asset("图片1", "A")]);
    const next = maps([asset("图片1", "A")]);
    expect(remapVideoReferenceMentions("@图片9 保留", prev, next)).toBe("@图片9 保留");
  });

  it("returns text unchanged when nothing references a changed asset", () => {
    const prev = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const next = maps([asset("图片1", "B")]);
    expect(remapVideoReferenceMentions("没有任何引用", prev, next)).toBe("没有任何引用");
  });
});

describe("VideoReference mention lookup", () => {
  it("returns the trailing mention index and query", () => {
    expect(findVideoReferenceTrailingMention("镜头跟随 @图片2")).toEqual({
      index: 5,
      query: "图片2",
    });
    expect(getVideoReferenceMentionQuery("镜头跟随 @图")).toBe("图");
  });

  it("ignores mentions that are not at the end", () => {
    expect(findVideoReferenceTrailingMention("@图片1 后继续描述")).toBeNull();
    expect(getVideoReferenceMentionQuery("无引用")).toBeNull();
  });
});

describe("sameVideoReferenceLabelIdentity", () => {
  it("detects when the label identity mapping changes", () => {
    const current = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const same = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const reordered = maps([asset("图片1", "B"), asset("图片2", "A")]);
    expect(sameVideoReferenceLabelIdentity(current, same)).toBe(true);
    expect(sameVideoReferenceLabelIdentity(current, reordered)).toBe(false);
  });
});
