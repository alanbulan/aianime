// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("ImageGenNode context palette", () => {
  it("wires ImageGenNode to context collection and prompt insertion", () => {
    const controllerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/canvas/hooks/useImageGenNodeController.ts",
      ),
      "utf8",
    );
    const viewSource = readFileSync(
      resolve(process.cwd(), "src/features/canvas/nodes/ImageGenNodeView.tsx"),
      "utf8",
    );

    // 调色盘按钮通过 NodeContextPromptPaletteButton 接入（该 wrapper 内部订阅
    // nodes/edges 构建 palette，宿主节点不再为它订阅整图）。
    expect(viewSource).toContain("<NodeContextPromptPaletteButton");
    expect(viewSource).toContain("nodeId={id}");
    // 插入走编辑器命令式 API（回调稳定，不再依赖 prompt）。
    expect(controllerSource).toContain("contextPromptPaletteInsertionText(entry)");
    expect(controllerSource).toContain("insertTextAtCursor(");
    expect(viewSource).toContain("ref={promptEditorRef}");

    // 上下文收集逻辑已下沉到 wrapper —— 在那里仍然构建 palette。
    const wrapperSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/canvas/nodes/ContextPromptPaletteButton.tsx",
      ),
      "utf8",
    );
    expect(wrapperSource).toContain(
      "buildContextPromptPaletteForNode(nodes, edges, nodeId)",
    );
  });
});
