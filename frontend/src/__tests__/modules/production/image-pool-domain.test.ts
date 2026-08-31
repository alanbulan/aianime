// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  imagePoolModelSource,
  type PoolImage,
} from "@/modules/production/domain/image-pool";

const image: PoolImage = {
  id: "image-1",
  type: "render",
  mode: "3x3",
  grid_index: 0,
  cell_index: 0,
  row: 0,
  col: 0,
  original_beat: 1,
  cell_url: "/cell.png",
  grid_url: "/grid.png",
  grid_path: "render/grid.png",
  stale: false,
};

describe("imagePoolModelSource", () => {
  it("用完整选择器作提示，并用末段模型 ID 作紧凑标签", () => {
    expect(
      imagePoolModelSource({
        ...image,
        model: "image-model-v2",
        model_selector: "sku:BYOK:image-model-v2",
      }),
    ).toEqual({
      label: "image-model-v2",
      tooltip: "sku:BYOK:image-model-v2",
    });
  });

  it("旧索引没有来源元数据时不伪造当前模型", () => {
    expect(imagePoolModelSource(image)).toBeNull();
  });
});
