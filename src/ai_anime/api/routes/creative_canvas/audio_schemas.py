"""Inbound schemas for Creative Canvas audio-generation endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class FreezoneAudioVoiceRef(BaseModel):
    """Freezone 音频节点声线引用。

    推荐先调用 `GET /freezone/audio/references` 获取可选声线，再把其中
    `available[]` 项目的 scope / voice_id / character_name / identity_id / slot 传回来。
    后端只信任这些标识，会重新从账号或项目数据解析真实音频文件，不使用前端传入的 path/url。
    """

    scope: Literal[
        "project_narrator",
        "user_custom",
        "character_default",
        "character_age_group",
        "identity",
        "identity_resolved",
    ] = Field(
        description=(
            "声线类型：project_narrator=项目解说人；user_custom=账号级我的音色；"
            "character_default=角色默认声线；"
            "character_age_group=角色年龄段声线；identity=身份自己的声线；"
            "identity_resolved=按身份声线→年龄段声线→角色默认声线兜底后的实际声线"
        ),
        examples=["identity_resolved"],
    )
    character_name: str = Field(
        default="",
        description="角色名。scope 为 character_* 或 identity* 时必填，需匹配项目角色名。",
        examples=["林小满"],
    )
    identity_id: str = Field(
        default="",
        description="身份 ID。scope 为 identity 或 identity_resolved 时必填。",
        examples=["林小满_青年"],
    )
    slot: str = Field(
        default="",
        description="年龄段声线槽位。scope=character_age_group 时必填，可选 child/youth/middle/elder。",
        examples=["youth"],
    )
    voice_id: str = Field(
        default="",
        description=(
            "账号级我的音色 ID。scope=user_custom 时必填，来自 "
            "GET /freezone/audio/references 的 user_voices[]/available[]，"
            "或 POST /freezone/audio/voices 的返回值。"
        ),
        examples=["fv_abc123"],
    )


class FreezoneAudioSpeechRequest(BaseModel):
    """Freezone 音频节点：文本生成语音请求。"""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(
        description=("要合成的台词/旁白文本。"),
        examples=["她低声说：终于等到这一天了。"],
    )
    emotion_prompt: str = Field(
        default="",
        description=(
            "可选情绪提示词，会传给 IndexTTS2 的 emotion_prompt。为空时使用项目解说风格。"
            "示例：紧张、压低声音、带一点恐惧感。"
        ),
        examples=["紧张、压低声音、带一点恐惧感"],
    )
    voice_ref: Optional[FreezoneAudioVoiceRef] = Field(
        default=None,
        description=(
            "可选声线引用。为空时使用项目默认解说/解说主角声线；传入时后端会按 scope 和角色/身份标识"
            "重新解析账号级或项目内参考音频。"
        ),
    )
    target_episode: Optional[int] = Field(
        default=None,
        ge=1,
        description="可选：目标主线集数。提供后，任务结果会返回 beat_audio 推送目标",
    )
    target_beat: Optional[int] = Field(
        default=None,
        ge=1,
        description="可选：目标主线 beat。提供后，任务结果会返回 beat_audio 推送目标",
    )


class FreezoneAudioMusicRequest(BaseModel):
    """Freezone 音频节点：文本生成音乐请求。"""

    model_config = ConfigDict(extra="forbid")

    input: str = Field(
        description="音乐描述 prompt。",
        examples=["cinematic rain-soaked suspense music"],
    )
    response_format: Literal["mp3", "opus", "pcm", "ulaw", "alaw"] = Field(
        default="mp3",
        description="音频返回格式。mp3 会自动映射为 mp3_44100_128。",
    )
    music_length_ms: int = Field(
        default=30_000,
        ge=3000,
        le=600000,
        description="生成长度，毫秒，范围 3000 到 600000。",
    )
    force_instrumental: bool = Field(
        default=True,
        description="是否强制生成纯音乐。",
    )
    respect_sections_durations: bool = Field(
        default=True,
        description="是否严格遵循分段时长。对 prompt 生成通常由模型忽略。",
    )
    output_format: str = Field(
        default="mp3_44100_128",
        description="fal 原生音频格式，例如 mp3_44100_128、opus_48000_128。",
    )


__all__ = [
    "FreezoneAudioMusicRequest",
    "FreezoneAudioSpeechRequest",
    "FreezoneAudioVoiceRef",
]
