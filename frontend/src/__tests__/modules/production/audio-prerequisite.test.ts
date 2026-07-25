// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { resolveAudioRegenerationError } from "@/modules/production/domain/audio-prerequisite";

describe("Production audio prerequisite rules", () => {
  it("keeps regular service errors unchanged", () => {
    expect(resolveAudioRegenerationError("TTS 服务暂不可用")).toEqual({
      message: "TTS 服务暂不可用",
      target: null,
    });
  });

  it("routes missing project narrator voice to the voice assets tab", () => {
    expect(
      resolveAudioRegenerationError(
        "Beat 01 解说声线缺失：项目解说人声线缺失",
      ),
    ).toEqual({
      message:
        "Beat 01 解说声线缺失：项目解说人声线缺失。请到「资产 > 声线」上传或裁剪默认解说声线。",
      target: "voices",
    });
  });

  it("routes missing narrator protagonist voice to characters", () => {
    expect(
      resolveAudioRegenerationError(
        "Beat 01 解说声线缺失：请到角色工作台配置解说主角",
      ),
    ).toEqual({
      message:
        "Beat 01 解说声线缺失：请到角色工作台配置解说主角。请到「角色」中上传解说主角声线。",
      target: "characters",
    });
  });
});
