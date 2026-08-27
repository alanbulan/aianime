// Copyright (c) 2026 AI anime

export const AI_ANIME_TOOL_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  ai_anime_get: "读取项目数据",
  ai_anime_post: "提交项目操作",
  ai_anime_create_style: "创建风格",
  ai_anime_generate_style_preview: "生成风格参考图",
  ai_anime_upload_style_preview: "上传风格参考图",
  ai_anime_patch: "更新项目数据",
  ai_anime_delete: "删除项目数据",
  ai_anime_pipeline_status: "检查制作进度",
  ai_anime_list_tasks: "读取任务列表",
  ai_anime_get_task: "读取任务进度",
  ai_anime_wait_task: "等待任务完成",
  ai_anime_get_episode_script: "读取分集脚本",
  ai_anime_list_ingest_uploads: "读取已上传剧本",
  ai_anime_run_production_workflow: "完整生成全部内容",
  ai_anime_run_script_workflow: "执行脚本生产图",
  ai_anime_start_ingest: "开始剧本摄入",
  ai_anime_build_characters: "提取角色",
  ai_anime_plan_episodes: "规划分集",
  ai_anime_generate_script: "生成分集脚本",
  ai_anime_update_character_face_prompt: "更新角色面部提示词",
  ai_anime_plan_identities: "规划角色身份",
  ai_anime_plan_scenes: "规划场景",
  ai_anime_plan_props: "规划道具",
  ai_anime_generate_scene_master: "生成场景主参考图",
  ai_anime_generate_scene_reverse: "生成场景反向参考图",
  ai_anime_generate_portrait: "生成角色肖像",
  ai_anime_generate_identity_image: "生成角色身份图",
  ai_anime_generate_sketches: "生成分镜草图",
  ai_anime_detect_sketch_identities: "检测草图身份与道具",
  ai_anime_get_sketches: "读取正式草图",
  ai_anime_get_first_frames: "读取视频首帧",
  ai_anime_get_sketch_candidates: "读取草图候选",
  ai_anime_get_scene_images: "读取场景参考图",
  ai_anime_get_character_media: "读取角色素材",
  ai_anime_get_episode_media: "读取分集素材",
  ai_anime_render_first_frames: "生成视频首帧",
  ai_anime_design_character_voices: "生成角色声线",
  ai_anime_generate_audio: "生成分集音频",
  ai_anime_optimize_video_global: "优化全局视频提示词",
  ai_anime_compose_episode: "合成整集视频",
  ai_anime_get_final_video: "读取最终成片",
  ai_anime_start_single_video: "生成单镜头视频",
};

const GENERIC_TOOL_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  bash: "执行命令",
  browser: "浏览网页",
  delete: "删除项目数据",
  edit: "修改文件",
  edit_file: "修改文件",
  exec: "执行命令",
  get: "读取项目数据",
  patch: "更新项目数据",
  post: "执行项目操作",
  read: "读取文件",
  read_file: "读取文件",
  search: "搜索内容",
  shell: "执行命令",
  skill: "加载技能",
  skill_view: "加载技能",
  skills_list: "读取技能列表",
  web_search: "搜索网络",
  write: "写入文件",
  write_file: "写入文件",
};

function normalizedToolKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function toolDisplayName(name: string): string {
  const raw = name.trim();
  if (!raw) return "工具调用";
  if (/[\u3400-\u9fff]/u.test(raw)) return raw;

  const key = normalizedToolKey(raw);
  const exact = AI_ANIME_TOOL_DISPLAY_NAMES[key];
  if (exact) return exact;

  const genericKey = key.replace(/^ai_anime_/, "").replace(/^freezone_/, "");
  return AI_ANIME_TOOL_DISPLAY_NAMES[`ai_anime_${genericKey}`]
    ?? GENERIC_TOOL_DISPLAY_NAMES[genericKey]
    ?? "执行工具操作";
}
