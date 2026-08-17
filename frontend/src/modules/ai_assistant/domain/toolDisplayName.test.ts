import { describe, expect, it } from "vitest";

import {
  AI_ANIME_TOOL_DISPLAY_NAMES,
  toolDisplayName,
} from "@/modules/ai_assistant/domain/toolDisplayName";

const EXPECTED_AI_ANIME_TOOLS = [
  "ai_anime_get",
  "ai_anime_post",
  "ai_anime_create_style",
  "ai_anime_generate_style_preview",
  "ai_anime_upload_style_preview",
  "ai_anime_patch",
  "ai_anime_delete",
  "ai_anime_pipeline_status",
  "ai_anime_list_tasks",
  "ai_anime_get_task",
  "ai_anime_wait_task",
  "ai_anime_get_episode_script",
  "ai_anime_list_ingest_uploads",
  "ai_anime_run_production_workflow",
  "ai_anime_run_script_workflow",
  "ai_anime_start_ingest",
  "ai_anime_build_characters",
  "ai_anime_plan_episodes",
  "ai_anime_generate_script",
  "ai_anime_update_character_face_prompt",
  "ai_anime_plan_identities",
  "ai_anime_plan_scenes",
  "ai_anime_plan_props",
  "ai_anime_generate_scene_master",
  "ai_anime_generate_scene_reverse",
  "ai_anime_generate_portrait",
  "ai_anime_generate_identity_image",
  "ai_anime_generate_sketches",
  "ai_anime_detect_sketch_identities",
  "ai_anime_get_sketches",
  "ai_anime_get_first_frames",
  "ai_anime_get_sketch_candidates",
  "ai_anime_get_scene_images",
  "ai_anime_get_character_media",
  "ai_anime_get_episode_media",
  "ai_anime_render_first_frames",
  "ai_anime_generate_audio",
  "ai_anime_optimize_video_global",
  "ai_anime_compose_episode",
  "ai_anime_get_final_video",
  "ai_anime_start_single_video",
] as const;

describe("AI assistant tool display names", () => {
  it("covers the complete AI anime plugin tool inventory in Chinese", () => {
    expect(Object.keys(AI_ANIME_TOOL_DISPLAY_NAMES).sort()).toEqual(
      [...EXPECTED_AI_ANIME_TOOLS].sort(),
    );
    for (const name of EXPECTED_AI_ANIME_TOOLS) {
      expect(toolDisplayName(name)).toMatch(/[\u3400-\u9fff]/u);
    }
  });

  it("also localizes normalized names and never leaks an unknown English title", () => {
    expect(toolDisplayName("get scene images")).toBe("读取场景参考图");
    expect(toolDisplayName("unknown_external_tool")).toBe("执行工具操作");
  });
});
