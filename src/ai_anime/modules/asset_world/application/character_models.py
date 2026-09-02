"""Character models owned by the Asset & World application layer."""

import re
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ai_anime.modules.asset_world.domain.asset_names import path_safe_asset_name


class CharacterIdentity(BaseModel):
    """角色身份 - 代表角色的一个特定形态。

    核心理念：身份才是本质。同一角色可以有多个身份，
    每个身份有独立的外貌、服装、Prompt、参考图。

    例如：
    - 谢铮的"和尚"身份：光头、僧袍、佛珠
    - 谢铮的"皇帝"身份：龙袍、高冠、帝王威仪
    """

    identity_id: str = Field(..., description="身份唯一ID，如 谢铮_皇帝、谢铮_和尚")
    character_name: str = Field(..., description="关联的主角色名")
    identity_name: str = Field(..., description="身份名称，如 '皇帝'、'和尚'")

    # 角色唯一短标签（用于图片生成中的身份锁定）
    character_tag: str = Field(
        default="",
        description="角色唯一短标签，如 '[JiangSN]'、'[XieZ]'，用于 Prompt 中的身份锁定",
    )

    # 服装描述（该身份特有）
    appearance_details: str = Field(
        default="",
        description="该身份的服装、配饰、发型造型（不含动作和表情）",
    )

    # 参考图（该身份独有）
    reference_images: List[str] = Field(
        default_factory=list,
        description="该身份的参考图路径列表",
    )

    # 面部特征（年龄变体等需要不同脸的身份）
    face_prompt: str = Field(
        default="",
        description="身份级面部特征（用于幼年/老年等面部差异大的身份），fallback 到角色级 face_prompt",
    )

    # 年龄段（仅年龄变体身份填写，用于自动映射声音预设）
    age_group: str = Field(
        default="",
        description="该身份的年龄段: child/youth/middle/elder（仅年龄变体填写）",
    )

    # 体型（年龄变体等需要不同体型的身份）
    body_type: str = Field(
        default="",
        description="身份级体型描述（用于幼年/老年等体型差异大的身份），fallback 到角色级 body_type",
    )

    reference_audio_path: str = Field(
        default="",
        description="身份级参考音频路径（项目相对路径），优先级高于角色级 reference_audio_path",
    )
    reference_audio_updated_at: str = Field(
        default="",
        description="身份级声线最后一次内容变化时间 ISO 字符串",
    )
    reference_audio_sha256: str = Field(
        default="",
        description="身份级参考音频内容 SHA256，用于声线来源校验",
    )

    # 身份级 portrait（用户上传或 AI 生成）
    portrait_image: str = Field(
        default="",
        description="身份级脸部参考图路径（当 face_prompt 非空时使用）",
    )

    # 服装参考图（用户上传，生成四视图时用于服装锚定）
    costume_image: str = Field(
        default="",
        description="服装参考图路径（用户上传，生成四视图时用于服装锚定）",
    )

    # 来源
    source: str = Field(
        default="extracted",
        description="来源: 'extracted'（小说提取）或 'user_created'（手动创建）",
    )
    updated_at: str = Field(
        default="", description="身份资产最后一次内容变化时间 ISO 字符串"
    )

    @model_validator(mode="after")
    def sanitize_names(self):
        """清理身份名称中的文件系统不安全字符。"""
        self.identity_name = re.sub(r'[/\\:*?"<>|]', "_", self.identity_name)
        self.identity_id = re.sub(r'[/\\:*?"<>|]', "_", self.identity_id)
        return self

    @field_validator("age_group", mode="before")
    @classmethod
    def normalize_age_group(cls, value):
        """兼容历史 null，并统一为字符串。"""
        if value is None:
            return ""
        return str(value)

    def __setattr__(self, name, value):
        if name == "age_group" and value is None:
            value = ""
        super().__setattr__(name, value)


class NovelCharacter(BaseModel):
    """小说角色实体。

    双层参考架构（Portrait + Identity）：
    - 第一层 Portrait（必需）：纯面部特写，中性背景，用于锁定面部身份
    - 第二层 Identity（可选）：完整角色图含服装，用于固定服装

    使用策略：
    - 有激活的 identity → 双参考模式（锁脸 + 锁服装）
    - 无激活的 identity → 单参考模式（锁脸，服装由文字描述控制）

    核心理念（Prompt 分离）：
    - face_prompt: 纯面部特征（发型、眼睛、肤色），用于 Portrait 生成
    - identity.appearance_details: 服装造型，用于 Identity 生成
    - 默认所有身份共用同一个 face_prompt，确保面部一致性
    - 年龄变体（幼年/老年等）可通过 identity.face_prompt 提供独立面部特征

    identities 存储为 JSON 字符串。
    使用 get_identities() / set_identities() 方法访问。
    """

    name: str = Field(..., description="角色全名")
    aliases: List[str] = Field(default_factory=list, description="别名列表")
    role: str = Field(default="", description="角色定位（主角/配角/反派）")
    is_main: bool = Field(
        default=False,
        description="是否为唯一叙事锚点；第一人称项目中即第一人称叙述者",
    )
    gender: str = Field(default="", description="性别")
    age_group: str = Field(
        default="youth", description="年龄段: child/youth/middle/elder"
    )
    body_type: str = Field(default="", description="体型描述，如'纤细高挑'、'健壮魁梧'")
    reference_audio_path: str = Field(
        default="",
        description="角色级参考音频路径（项目相对路径，default slot）",
    )
    reference_audio_sha256: str = Field(
        default="",
        description="角色级参考音频内容 SHA256",
    )
    reference_audio_updated_at: str = Field(
        default="",
        description="角色级默认声线最后一次内容变化时间 ISO 字符串",
    )
    voice_samples_by_age_group_json: str = Field(
        default="{}",
        description="按年龄段（child/youth/middle/elder）划分的声线样本 JSON：{slot: {path, sha256, updated_at}}",
    )
    description: str = Field(default="", description="角色描述")

    # ============================================================
    # 第一层：Portrait（必需）- 纯面部特写
    # ============================================================

    # 纯面部特征（用于 Portrait 生成）
    face_prompt: str = Field(
        default="",
        description="纯面部特征描述（发型、眼睛、肤色、骨骼轮廓），用于 Portrait 生成",
    )

    appearance_details: str = Field(
        default="",
        description="默认服装描述（文字），当无激活身份时使用",
    )

    # ============================================================
    # 第二层：Identity（可选）- 完整角色图（含服装）
    # ============================================================
    # 身份系统 - 存储为 JSON 字符串以兼容 Neo4j
    identities_json: str = Field(
        default="[]",
        description="身份列表的 JSON 字符串",
    )
    updated_at: str = Field(
        default="", description="角色资产最后一次内容变化时间 ISO 字符串"
    )

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @model_validator(mode="before")
    @classmethod
    def _coerce_voice_samples_kwarg(cls, data):
        """Accept ``voice_samples_by_age_group=dict(...)`` kwarg and stash to JSON.

        Source-branch voice_clone tests construct ``NovelCharacter(...,
        voice_samples_by_age_group={...})`` directly. We persist the field as
        ``voice_samples_by_age_group_json`` (mirrors ``identities_json``), so
        this pre-validator translates the dict kwarg into the JSON column.
        """
        if isinstance(data, dict) and "voice_samples_by_age_group" in data:
            samples = data.pop("voice_samples_by_age_group") or {}
            if isinstance(samples, dict):
                import json as _json

                data.setdefault(
                    "voice_samples_by_age_group_json",
                    _json.dumps(samples, ensure_ascii=False),
                )
        return data

    @model_validator(mode="after")
    def sanitize_name(self):
        """清理角色名称中的文件系统不安全字符。"""
        self.name = path_safe_asset_name(self.name, kind="character")
        return self

    @property
    def identities(self) -> List[CharacterIdentity]:
        """获取身份列表（从 JSON 解析，不使用缓存）。"""
        if not self.identities_json or self.identities_json == "[]":
            return []

        import json

        try:
            data = json.loads(self.identities_json)
            return [CharacterIdentity(**item) for item in data]
        except (json.JSONDecodeError, TypeError):
            return []

    @property
    def voice_samples_by_age_group(self) -> dict[str, dict]:
        """按年龄段划分的声线样本（dict 视图，从 JSON 字段解析）。"""
        if not self.voice_samples_by_age_group_json:
            return {}
        import json

        try:
            data = json.loads(self.voice_samples_by_age_group_json)
            return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    @voice_samples_by_age_group.setter
    def voice_samples_by_age_group(self, value: dict[str, dict]) -> None:
        import json

        self.voice_samples_by_age_group_json = json.dumps(
            value or {}, ensure_ascii=False
        )

    @identities.setter
    def identities(self, value: List[CharacterIdentity]):
        """设置身份列表（序列化为 JSON）。"""
        import json

        if not value:
            self.identities_json = "[]"
        else:
            self.identities_json = json.dumps(
                [item.model_dump() for item in value],
                ensure_ascii=False,
            )

    def get_identity(self, identity_name: str) -> Optional[CharacterIdentity]:
        """按身份名称获取身份。"""
        for identity in self.identities:
            if identity.identity_name == identity_name:
                return identity
        return None

    def ensure_tag(self) -> None:
        """确保每个 identity 有独立的 tag。"""
        from ai_anime.shared.utils.identity_resolver import compute_char_tag

        identities = self.identities
        if identities:
            for identity in identities:
                if not identity.character_tag:
                    identity.character_tag = compute_char_tag(
                        self.name,
                        identity_id=identity.identity_id,
                    )
            self.identities = identities


__all__ = ["CharacterIdentity", "NovelCharacter"]
