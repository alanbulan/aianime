// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  buildSeedance2LabelIdentityMaps,
  findSeedance2TrailingMention,
  getSeedance2MentionQuery,
  remapSeedance2Mentions,
  sameSeedance2LabelIdentity,
  type Seedance2ReferenceAssetLike,
} from "@/modules/production/domain/seedance2-mentions";

const asset = (
  reference_label: string,
  url: string,
): Seedance2ReferenceAssetLike => ({ reference_label, url, key: url });

const maps = (assets: Seedance2ReferenceAssetLike[]) =>
  buildSeedance2LabelIdentityMaps(assets);

describe("remapSeedance2Mentions", () => {
  it("renumbers a mention when an earlier asset is deleted", () => {
    const prev = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const next = maps([asset("图片1", "B")]);
    expect(remapSeedance2Mentions("用 @图片2 收尾", prev, next)).toBe(
      "用 @图片1 收尾",
    );
  });

  it("drops a mention whose asset was removed with its trailing space", () => {
    const prev = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const next = maps([asset("图片1", "B")]);
    expect(remapSeedance2Mentions("先 @图片1 再 @图片2 收尾", prev, next)).toBe(
      "先 再 @图片1 收尾",
    );
  });

  it("follows assets through a reorder", () => {
    const prev = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const next = maps([asset("图片1", "B"), asset("图片2", "A")]);
    expect(remapSeedance2Mentions("@图片1 和 @图片2", prev, next)).toBe(
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
    expect(remapSeedance2Mentions("看 @图片2 听 @音频2", prev, next)).toBe(
      "看 @图片1 听 @音频1",
    );
  });

  it("leaves unknown labels untouched", () => {
    const prev = maps([asset("图片1", "A")]);
    const next = maps([asset("图片1", "A")]);
    expect(remapSeedance2Mentions("@图片9 保留", prev, next)).toBe("@图片9 保留");
  });

  it("returns text unchanged when nothing references a changed asset", () => {
    const prev = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const next = maps([asset("图片1", "B")]);
    expect(remapSeedance2Mentions("没有任何引用", prev, next)).toBe("没有任何引用");
  });
});

describe("Seedance2 mention lookup", () => {
  it("returns the trailing mention index and query", () => {
    expect(findSeedance2TrailingMention("镜头跟随 @图片2")).toEqual({
      index: 5,
      query: "图片2",
    });
    expect(getSeedance2MentionQuery("镜头跟随 @图")).toBe("图");
  });

  it("ignores mentions that are not at the end", () => {
    expect(findSeedance2TrailingMention("@图片1 后继续描述")).toBeNull();
    expect(getSeedance2MentionQuery("无引用")).toBeNull();
  });
});

describe("sameSeedance2LabelIdentity", () => {
  it("detects when the label identity mapping changes", () => {
    const current = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const same = maps([asset("图片1", "A"), asset("图片2", "B")]);
    const reordered = maps([asset("图片1", "B"), asset("图片2", "A")]);
    expect(sameSeedance2LabelIdentity(current, same)).toBe(true);
    expect(sameSeedance2LabelIdentity(current, reordered)).toBe(false);
  });
});
