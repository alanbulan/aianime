"""Transport schemas for Creative Canvas video endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from ai_anime.api.canvas_mark_schemas import FreezoneVideoMark


class FreezoneExtractFramesRequest(BaseModel):
    video_url: str
    max_frames: int = 20
    scene_threshold: float = 0.3


class FreezoneAnalyzeShotsRequest(BaseModel):
    frame_urls: list[str]
    provider: Optional[str] = None
    model: Optional[str] = None
    analysis_mode: Literal["shots", "video_story"] = "shots"
    duration_sec: Optional[float] = None


class FreezoneAnalyzeVideoStoryRequest(BaseModel):
    video_url: str = Field(
        description=("视频静态地址。必须是当前项目下真实存在的 /static/... 视频 URL"),
        examples=["/static/admin/58/freezone/_uploads/example.mp4"],
    )
    max_frames: int = Field(
        default=20,
        ge=3,
        le=50,
        description=(
            "最多抽取多少张关键帧。建议 12-20；越多分析越细，但耗时和 token 成本更高"
        ),
    )
    scene_threshold: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description=(
            "ffmpeg 场景切换阈值，范围 0-1。越低越容易抽到帧；"
            "长镜头/剧情片建议 0.2-0.3，快剪视频建议 0.4-0.5"
        ),
    )
    duration_sec: Optional[float] = Field(
        default=None,
        gt=0,
        description=(
            "视频总时长，单位秒。可选；传入后视频故事表的 start_time/end_time 会更准确"
        ),
        examples=[15],
    )


class FreezoneVideoCharacterLibraryItemRequest(BaseModel):
    """视频节点资产库录入请求。

    素材先通过通用 upload 上传，再把静态地址登记到资产库。图片走 image_urls，
    视频/音频走对应的单地址字段。
    """

    name: str = Field(description="资产名称，用于前端资产库展示")
    media: Literal["image", "video", "audio"] = Field(
        default="image",
        description="素材类型：图片 / 视频 / 音频",
    )
    image_urls: list[str] = Field(
        default_factory=list,
        description="图片参考图静态地址列表（media=image 时至少一张）",
    )
    video_url: str | None = Field(
        default=None,
        description="视频静态地址（media=video 时必填）",
    )
    audio_url: str | None = Field(
        default=None,
        description="音频静态地址（media=audio 时必填）",
    )


class FreezoneVideoGenRequest(BaseModel):
    """文生视频请求。

    运镜通过模板库和补充提示词控制；角色库通过 `character_ids` 引用已上传的人物参考图。
    """

    prompt: str = Field(description="用户输入的视频内容描述")
    camera_template_id: Optional[str] = Field(
        default=None,
        description="运镜模板 id，例如 locked_off / follow_tracking / orbit_up",
    )
    character_ids: list[str] = Field(
        default_factory=list,
        description="视频角色库条目 id 列表，用于追加角色参考图",
    )
    marks: list["FreezoneVideoMark"] = Field(
        default_factory=list,
        description="局部元素标记列表。来自前端点击图片选中的主体/物体局部区域，不是普通 tags",
    )
    aspect_ratio: Literal["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] = Field(
        default="16:9",
        description="视频比例；auto 当前回退为 16:9",
    )
    resolution: Literal["480p", "720p", "1080p"] = Field(
        default="720p",
        description="输出清晰度档位",
    )
    duration_seconds: int = Field(
        default=5,
        ge=1,
        description="视频时长，至少 1 秒；不同模型支持的时长范围可能不同",
    )
    generate_audio: bool = Field(default=False, description="是否生成原生音频")
    human_review: bool = Field(
        default=False,
        description="是否开启 HuiMeng 真人素材审核/加白流程，用于可能包含真人人脸的素材",
    )
    scene_optimize: Optional[Literal["anime", "realistic"]] = Field(
        default=None,
        description="Seedance 2.0 Value 系列的场景风格优化参数",
    )
    model: str = Field(
        default="newapi_seedance-2.0-fast",
        description="视频模型名称。请传 `/api/v1/projects/{project}/freezone/video/models` 返回值之一。",
    )
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )
    gen_mode: Optional[str] = Field(
        default=None, description="可选：生成模式，用于还原节点时回填 genMode"
    )


class FreezoneImageToVideoRequest(BaseModel):
    """图片参考视频请求。

    统一承接图生视频和图片参考视频：
    - 1 张图片：首帧图生视频
    - 2-9 张图片：多图图片参考视频
    """

    image_urls: list[str] = Field(
        default_factory=list,
        description="图片参考静态地址列表，支持 1-9 张。第一张默认作为主参考图/首帧参考图",
    )
    prompt: str = Field(default="", description="用户补充视频描述，可为空")
    camera_template_id: Optional[str] = Field(
        default=None,
        description="运镜模板 id，例如 locked_off / follow_tracking / pedestal_up",
    )
    marks: list["FreezoneVideoMark"] = Field(
        default_factory=list,
        description="局部元素标记列表。来自前端点击图片选中的主体/物体局部区域，不是普通 tags",
    )
    aspect_ratio: Literal["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] = Field(
        default="16:9",
        description="视频比例；auto 当前回退为 16:9",
    )
    resolution: Literal["480p", "720p", "1080p"] = Field(
        default="720p",
        description="输出清晰度档位",
    )
    duration_seconds: int = Field(
        default=5,
        ge=1,
        description="视频时长，至少 1 秒；不同模型支持的时长范围可能不同",
    )
    generate_audio: bool = Field(default=False, description="是否生成原生音频")
    human_review: bool = Field(
        default=False,
        description="是否开启 HuiMeng 真人素材审核/加白流程，用于可能包含真人人脸的素材",
    )
    scene_optimize: Optional[Literal["anime", "realistic"]] = Field(
        default=None,
        description="Seedance 2.0 Value 系列的场景风格优化参数",
    )
    model: str = Field(
        default="newapi_seedance-2.0-fast",
        description="视频模型或模型选项 id。请传 /freezone/video/models 返回值之一",
    )
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )
    gen_mode: Optional[str] = Field(
        default=None, description="可选：生成模式，用于还原节点时回填 genMode"
    )


class FreezoneKeyframeVideoRequest(BaseModel):
    """首尾帧视频请求。

    接受首帧 / 尾帧两个输入，至少需要提供一个。
    """

    first_frame_url: Optional[str] = Field(
        default=None,
        description="首帧参考图静态地址，可为空；与尾帧至少提供一个",
    )
    last_frame_url: Optional[str] = Field(
        default=None,
        description="尾帧参考图静态地址，可为空；与首帧至少提供一个",
    )
    prompt: str = Field(default="", description="用户补充视频描述，可为空")
    camera_template_id: Optional[str] = Field(
        default=None,
        description="运镜模板 id，例如 locked_off / follow_tracking / pedestal_up",
    )
    marks: list["FreezoneVideoMark"] = Field(
        default_factory=list,
        description="局部元素标记列表。来自前端点击图片选中的主体/物体局部区域，不是普通 tags",
    )
    aspect_ratio: Literal["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] = Field(
        default="16:9",
        description="视频比例；auto 当前回退为 16:9",
    )
    resolution: Literal["480p", "720p", "1080p"] = Field(
        default="720p",
        description="输出清晰度档位",
    )
    duration_seconds: int = Field(
        default=5,
        ge=1,
        description="视频时长，至少 1 秒；不同模型支持的时长范围可能不同",
    )
    generate_audio: bool = Field(default=False, description="是否生成原生音频")
    human_review: bool = Field(
        default=False,
        description="是否开启 HuiMeng 真人素材审核/加白流程，用于可能包含真人人脸的素材",
    )
    scene_optimize: Optional[Literal["anime", "realistic"]] = Field(
        default=None,
        description="Seedance 2.0 Value 系列的场景风格优化参数",
    )
    model: str = Field(
        default="newapi_seedance-2.0-fast",
        description="视频模型或模型选项 id。请传 /freezone/video/models 返回值之一",
    )
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )
    gen_mode: Optional[str] = Field(
        default=None, description="可选：生成模式，用于还原节点时回填 genMode"
    )


class FreezoneVideoEditRequest(BaseModel):
    """视频编辑请求（HappyHorse 视频编辑功能）。

    输入 1 个源视频 + 0-5 张参考图，对视频进行编辑改写。
    """

    video_url: str = Field(description="源视频静态地址，必填")
    image_urls: list[str] = Field(
        default_factory=list,
        description="参考图静态地址列表，0-5 张，单张 <= 10MB",
    )
    prompt: str = Field(default="", description="用户编辑指令/视频描述，可为空")
    camera_template_id: Optional[str] = Field(
        default=None,
        description="运镜模板 id，例如 locked_off / follow_tracking / pedestal_up",
    )
    marks: list["FreezoneVideoMark"] = Field(
        default_factory=list,
        description="局部元素标记列表",
    )
    aspect_ratio: Literal["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] = Field(
        default="16:9",
        description="视频比例；视频编辑画幅由源视频决定，此字段仅占位",
    )
    resolution: Literal["480p", "720p", "1080p"] = Field(
        default="720p",
        description="输出清晰度档位",
    )
    duration_seconds: int = Field(
        default=5,
        ge=1,
        description="视频时长，至少 1 秒；不同模型支持的时长范围可能不同",
    )
    audio_setting: Literal["auto", "origin"] = Field(
        default="auto",
        description="视频编辑音频策略：auto 自动 / origin 保留原声",
    )
    generate_audio: bool = Field(default=False, description="是否生成原生音频")
    human_review: bool = Field(
        default=False,
        description="是否开启真人素材审核/加白流程",
    )
    model: str = Field(
        default="newapi_happyhorse-1.0",
        description="视频模型或模型选项 id。请传 /freezone/video/models 返回值之一",
    )
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )
    gen_mode: Optional[str] = Field(
        default=None, description="可选：生成模式，用于还原节点时回填 genMode"
    )


class FreezoneVideoReferenceItem(BaseModel):
    """全能参考单条素材。"""

    type: Literal["image", "video", "audio"] = Field(description="素材类型")
    url: str = Field(description="素材静态地址")
    role: str = Field(
        default="", description="素材角色，例如 角色参考 / 场景参考 / 配乐参考"
    )
    label: str = Field(default="", description="前端展示标签，可为空")


class FreezoneVideoOmniGenRequest(BaseModel):
    """全能参考视频请求。

    支持文本、图像、视频、音频混合输入。
    """

    prompt: str = Field(description="用户输入的视频内容描述")
    theme: str = Field(
        default="", description="主题参数，用于额外补充镜头主题、风格或叙事方向"
    )
    camera_template_id: Optional[str] = Field(
        default=None,
        description="运镜模板 id，例如 locked_off / follow_tracking / orbit_up",
    )
    references: list[FreezoneVideoReferenceItem] = Field(
        default_factory=list,
        description="混合参考素材列表。总数最多 12，图像≤9、视频≤3、音频≤3",
    )
    marks: list[FreezoneVideoMark] = Field(
        default_factory=list,
        description="局部元素标记列表。来自前端点击图片选中的主体/物体局部区域，不是普通 tags",
    )
    aspect_ratio: Literal["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] = Field(
        default="16:9",
        description="视频比例；auto 当前回退为 16:9",
    )
    resolution: Literal["480p", "720p", "1080p"] = Field(
        default="720p",
        description="输出清晰度档位",
    )
    duration_seconds: int = Field(
        default=5,
        ge=1,
        description="视频时长，至少 1 秒；不同模型支持的时长范围可能不同",
    )
    generate_audio: bool = Field(default=False, description="是否生成原生音频")
    human_review: bool = Field(
        default=False,
        description="是否开启 HuiMeng 真人素材审核/加白流程，用于可能包含真人人脸的素材",
    )
    scene_optimize: Optional[Literal["anime", "realistic"]] = Field(
        default=None,
        description="Seedance 2.0 Value 系列的场景风格优化参数",
    )
    model: str = Field(
        default="newapi_seedance-2.0-fast",
        description="视频模型或模型选项 id。请传 /freezone/video/models 返回值之一",
    )
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )
    gen_mode: Optional[str] = Field(
        default=None, description="可选：生成模式，用于还原节点时回填 genMode"
    )


class FreezoneVideoEraseRequest(BaseModel):
    """视频擦除请求。

    统一承接：
    - smart_subtitle: 智能去字幕（自动估计底部字幕框）
    - box: 框选擦除（前端传固定框）
    """

    source_url: str = Field(description="待处理视频的静态地址")
    mode: Literal["smart_subtitle", "box"] = Field(
        default="smart_subtitle",
        description="擦除模式：smart_subtitle 为智能去字幕，box 为框选擦除",
    )
    box_x: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="框选左上角 x，归一化 0-1"
    )
    box_y: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="框选左上角 y，归一化 0-1"
    )
    box_width: Optional[float] = Field(
        default=None,
        gt=0.0,
        le=1.0,
        description="框选宽度，归一化 0-1",
    )
    box_height: Optional[float] = Field(
        default=None,
        gt=0.0,
        le=1.0,
        description="框选高度，归一化 0-1",
    )


class FreezoneVideoUpscaleRequest(BaseModel):
    """视频高清请求。

    基础版使用 ffmpeg 做传统缩放、降噪和锐化，不调用 AI 超分模型。
    """

    source_url: str = Field(description="待高清处理视频的静态地址")
    resolution: Literal["1080p", "2k", "4k"] = Field(
        default="1080p",
        description="目标清晰度档位。按长边缩放：1080p=1920，2k=2560，4k=3840",
    )
    frame_interpolation: Literal["none"] = Field(
        default="none",
        description="补帧模式。基础版仅支持 none，不改变原视频帧率",
    )
    denoise_strength: Literal["none", "1x", "2x"] = Field(
        default="1x",
        description="降噪强度。none 不降噪；1x 轻度降噪；2x 中等降噪",
    )


class FreezoneAudioSeparateRequest(BaseModel):
    """音视频分离请求。

    当前仅实现轻量版：
    - 提取纯音频
    - 导出无声视频
    """

    source_url: str = Field(description="待处理视频的静态地址")
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


class FreezoneVideoComposeItem(BaseModel):
    item_id: str = Field(description="前端片段唯一标识")
    source_url: str = Field(description="源媒体静态地址")
    timeline_start: float = Field(
        default=0.0, ge=0.0, description="片段在时间线上的开始秒数"
    )
    source_start: float = Field(default=0.0, ge=0.0, description="源媒体裁剪起始秒")
    source_end: float = Field(
        gt=0.0, description="源媒体裁剪结束秒，必须大于 source_start"
    )
    volume: float = Field(default=1.0, ge=0.0, le=2.0, description="音量倍率")
    muted: bool = Field(default=False, description="是否静音")


class FreezoneVideoComposeTrack(BaseModel):
    track_id: str = Field(description="前端轨道唯一标识")
    kind: Literal["video", "audio"] = Field(description="轨道类型")
    items: list[FreezoneVideoComposeItem] = Field(
        default_factory=list, description="轨道片段列表"
    )


class FreezoneVideoComposeRequest(BaseModel):
    title: str = Field(default="", description="合成任务标题，可为空")
    canvas_id: str = Field(default="", description="来源画布 id，可为空")
    resolution: Literal["720p", "1080p"] = Field(
        default="1080p", description="目标输出分辨率"
    )
    fps: int = Field(default=30, ge=1, le=60, description="输出帧率")
    background_color: str = Field(
        default="#000000", description="补边或空隙使用的背景色"
    )
    keep_original_audio: bool = Field(
        default=True, description="是否保留视频片段自带音频"
    )
    tracks: list[FreezoneVideoComposeTrack] = Field(
        default_factory=list, description="时间线轨道列表"
    )


FreezoneVideoGenRequest.model_rebuild()
FreezoneImageToVideoRequest.model_rebuild()
FreezoneKeyframeVideoRequest.model_rebuild()
FreezoneVideoOmniGenRequest.model_rebuild()


__all__ = [
    "FreezoneAnalyzeShotsRequest",
    "FreezoneAnalyzeVideoStoryRequest",
    "FreezoneAudioSeparateRequest",
    "FreezoneExtractFramesRequest",
    "FreezoneImageToVideoRequest",
    "FreezoneKeyframeVideoRequest",
    "FreezoneVideoCharacterLibraryItemRequest",
    "FreezoneVideoComposeItem",
    "FreezoneVideoComposeRequest",
    "FreezoneVideoComposeTrack",
    "FreezoneVideoEditRequest",
    "FreezoneVideoEraseRequest",
    "FreezoneVideoGenRequest",
    "FreezoneVideoOmniGenRequest",
    "FreezoneVideoReferenceItem",
    "FreezoneVideoUpscaleRequest",
]
