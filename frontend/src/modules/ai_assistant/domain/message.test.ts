// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { normalizeMessage } from "@/modules/ai_assistant/public";

describe("AI Assistant message normalization", () => {
  it("strips internal AI anime context blocks from displayed text", () => {
    const normalized = normalizeMessage({
      id: "backend-user-1",
      role: "user",
      content: `上传了哪些文件了

[AI_ANIME_UPLOADED_FILES]
ai_anime_project_id: 01KT62KTBQCDR69WW889VHJR3N
file_1_filename: 她与她的江山.docx
[/AI_ANIME_UPLOADED_FILES]`,
      created_at: "2026-06-03T09:00:00Z",
    });

    expect(normalized?.text).toBe("上传了哪些文件了");
  });
});
