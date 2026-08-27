// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import {
  QIUQIU_EMOTIONS,
  resolveQiuQiuEmotion,
  type QiuQiuEmotionId,
} from "@/modules/ai_assistant/domain/qiuQiuEmotion";

function message(
  role: ChatMessage["role"],
  text: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `${role}-${text}`,
    role,
    text,
    timestamp: 1,
    ...overrides,
  };
}

describe("QiuQiu avatar emotion planning", () => {
  it("maps every one of the 32 source emotions to a current assistant or tool signal", () => {
    const scenarios: Array<{
      expected: QiuQiuEmotionId;
      message: ChatMessage;
      streaming?: boolean;
    }> = [
      { expected: "00", message: message("assistant", "进入睡眠") },
      { expected: "01", message: message("assistant", "已经唤醒") },
      { expected: "02", message: message("assistant", "我在这里。") },
      { expected: "03", message: message("assistant", "我有点好奇") },
      { expected: "04", message: message("assistant", "") },
      { expected: "05", message: message("assistant", "系统初始化中") },
      { expected: "06", message: message("assistant", "进入休眠") },
      { expected: "07", message: message("assistant", "正在重试") },
      { expected: "10", message: message("assistant", "太好了") },
      { expected: "11", message: message("assistant", "这里有疑问") },
      { expected: "12", message: message("assistant", "结果有些遗憾") },
      { expected: "13", message: message("assistant", "结果出乎意料") },
      { expected: "14", message: message("assistant", "不好意思") },
      { expected: "15", message: message("assistant", "任务耗时很久") },
      { expected: "16", message: message("assistant", "正在仔细检查") },
      { expected: "17", message: message("assistant", "现在有点慌张") },
      { expected: "18", message: message("assistant", "目前没办法继续") },
      { expected: "19", message: message("assistant", "结果符合预期") },
      { expected: "20", message: message("assistant", "需求存在歧义") },
      { expected: "21", message: message("assistant", "这让我很恼火") },
      { expected: "30", message: message("tool", "", { toolName: "plan_reason", toolState: "running" }) },
      { expected: "31", message: message("tool", "", { toolName: "submit_task", toolState: "running" }) },
      { expected: "32", message: message("tool", "", { toolName: "render_scene", toolState: "running" }) },
      { expected: "33", message: message("tool", "", { toolName: "render_scene", toolState: "success" }) },
      { expected: "34", message: message("tool", "", { toolName: "render_scene", toolState: "error", toolError: "GPU failure" }) },
      { expected: "35", message: message("assistant", "请确认下一步？") },
      { expected: "36", message: message("tool", "", { toolName: "browser_navigate", toolState: "running" }) },
      { expected: "37", message: message("tool", "", { toolName: "memory_recall", toolState: "running" }) },
      { expected: "38", message: message("tool", "", { toolName: "save_file", toolState: "error", toolError: "permission denied" }) },
      { expected: "39", message: message("assistant", "正在输出"), streaming: true },
      { expected: "40", message: message("tool", "", { toolName: "search_files", toolState: "running" }) },
      { expected: "41", message: message("tool", "", { toolName: "cancel_task", toolState: "running" }) },
    ];

    const resolved = scenarios.map(({ message: item, streaming }) =>
      resolveQiuQiuEmotion(item, streaming),
    );
    expect(resolved).toEqual(scenarios.map(({ expected }) => expected));
    expect(new Set(resolved)).toEqual(new Set(Object.keys(QIUQIU_EMOTIONS)));
  });

  it("uses agent feedback before tool type when a call settles", () => {
    const tool = message("tool", "", {
      toolName: "web_search",
      toolState: "success",
    });
    expect(resolveQiuQiuEmotion(tool)).toBe("33");
    expect(resolveQiuQiuEmotion({
      ...tool,
      toolState: "error",
      toolError: "network timeout",
    })).toBe("34");
    expect(resolveQiuQiuEmotion({
      ...tool,
      toolName: "cancel_task",
      toolState: "error",
      toolError: "timeout",
    })).toBe("34");
  });
});
