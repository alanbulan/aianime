// Copyright (c) 2026 AI anime

/**
 * 后端 freezone-audio 声线引用。Canvas 保留 camelCase 字段，transport
 * 映射由 infrastructure 负责，避免节点数据被序列化为 snake_case。
 */
export interface AudioVoiceRef {
  scope:
    | 'model_preset'
    | 'project_narrator'
    | 'user_custom'
    | 'character_default'
    | 'character_age_group'
    | 'identity'
    | 'identity_resolved';
  characterName?: string;
  identityId?: string;
  slot?: string;
  /** scope=model_preset 时记录预设音色所属的当前模型路由。 */
  modelId?: string;
  /** scope=model_preset 时保留云端/BYOK 精确路由，避免同名模型跨服务商串线。 */
  modelSelector?: string;
  /** scope=user_custom 时是账号级音色 ID；scope=model_preset 时是服务商预设音色值。 */
  voiceId?: string;
}
