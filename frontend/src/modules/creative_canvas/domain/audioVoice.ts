// Copyright (c) 2026 AI anime

/**
 * 后端 freezone-audio 声线引用。Canvas 保留 camelCase 字段，transport
 * 映射由 infrastructure 负责，避免节点数据被序列化为 snake_case。
 */
export interface AudioVoiceRef {
  scope:
    | 'project_narrator'
    | 'user_custom'
    | 'character_default'
    | 'character_age_group'
    | 'identity'
    | 'identity_resolved';
  characterName?: string;
  identityId?: string;
  slot?: string;
  /** scope=user_custom 时必填：账号级我的音色 ID。 */
  voiceId?: string;
}
