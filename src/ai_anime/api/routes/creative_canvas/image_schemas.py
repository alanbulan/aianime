"""Transport schemas for Creative Canvas image endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from ai_anime.api.routes.creative_canvas.mark_schemas import FreezoneVideoMark


class FreezoneImageCameraConfig(BaseModel):
    """图片节点摄像机参数。"""

    camera_body: str = Field(default="", description="相机机身，例如 Panavision DXL2")
    lens: str = Field(default="", description="镜头型号，例如 Arri Signature Prime")
    focal_length_mm: Optional[int] = Field(
        default=None,
        description="焦距，单位 mm，例如 35",
    )
    aperture: str = Field(default="", description="光圈，例如 f/4")


class FreezoneImageStyleConfig(BaseModel):
    """图片节点风格模板参数。"""

    template_id: str = Field(description="风格模板 id")


class FreezoneGenRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "1:1"
    image_size: str = "2K"
    reference_urls: list[str] = Field(default_factory=list)
    canvas_id: str = Field(
        default="",
        description="可选来源画布 id。用于后端按节点记录生成历史；为空时不记录节点历史。",
    )
    node_id: str = Field(
        default="",
        description="可选来源节点 id。用于后端按节点记录生成历史；为空时不记录节点历史。",
    )
    camera: Optional[FreezoneImageCameraConfig] = Field(
        default=None,
        description="可选摄像机参数，用于把机身 / 镜头 / 焦距 / 光圈注入图片提示词",
    )
    style: Optional[FreezoneImageStyleConfig] = Field(
        default=None,
        description="可选风格模板参数，用于把内置风格模板注入图片提示词",
    )
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Optional[str] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )
    model_id: Optional[str] = Field(
        default=None, description="可选：注册表模型 id，用于还原节点时回填 model"
    )
    gen_mode: Optional[str] = Field(
        default=None, description="可选：生成模式，用于还原节点时回填 genMode"
    )


class FreezoneEditRequest(BaseModel):
    prompt: str
    base_url: str
    extra_reference_urls: list[str] = Field(default_factory=list)
    aspect_ratio: str = "2:3"
    image_size: str = "2K"
    canvas_id: str = Field(
        default="",
        description="可选来源画布 id。用于后端按节点记录生成历史；为空时不记录节点历史。",
    )
    node_id: str = Field(
        default="",
        description="可选来源节点 id。用于后端按节点记录生成历史；为空时不记录节点历史。",
    )
    camera: Optional[FreezoneImageCameraConfig] = Field(
        default=None,
        description="可选摄像机参数，用于把机身 / 镜头 / 焦距 / 光圈注入图片提示词",
    )
    style: Optional[FreezoneImageStyleConfig] = Field(
        default=None,
        description="可选风格模板参数，用于把内置风格模板注入图片提示词",
    )
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Optional[str] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )
    model_id: Optional[str] = Field(
        default=None, description="可选：注册表模型 id，用于还原节点时回填 model"
    )
    gen_mode: Optional[str] = Field(
        default=None, description="可选：生成模式，用于还原节点时回填 genMode"
    )


class FreezoneImageTo3GSRequest(BaseModel):
    """从 Freezone 图片节点启动 SHARP，生成压缩 3GS SOG。"""

    source_url: str = Field(description="源图静态地址，通常来自 Freezone 图片节点")
    source_kind: Literal["master", "reverse", "pano"] = Field(
        default="master",
        description=(
            "3GS 来源类型；master/reverse 生成单面 SOG，pano 使用 360 全景生成 pano SOG"
        ),
    )
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )


class FreezoneCharacterMultiViewRequest(BaseModel):
    """多角度编辑器请求。

    基于一张源图做机位重定位或视角重构，输出单张结果图。
    """

    source_url: str = Field(description="源图静态地址，作为图生图的 base 图")
    preset: Literal[
        "custom",
        "fisheye",
        "oblique",
        "front",
        "front_up",
        "full_body",
        "back",
    ] = Field(
        default="custom", description="视角预设。custom 表示完全按 yaw/pitch 自定义"
    )
    yaw_degrees: float = Field(
        default=0.0, description="水平旋转角度，单位为度；正负方向由前端约定"
    )
    pitch_degrees: float = Field(
        default=0.0, description="垂直俯仰角度，单位为度；正负方向由前端约定"
    )
    shot_size: Literal[
        "extreme_close_up",
        "close_up",
        "medium_close",
        "medium",
        "full_body",
        "wide",
        "extreme_wide",
    ] = Field(
        default="medium",
        description="景别档位：大特写 / 特写 / 近景 / 中景 / 全身 / 远景 / 大远景",
    )
    prompt: str = Field(default="", description="用户补充提示词，可为空")
    image_size: str = Field(default="2K", description="输出分辨率档位，默认 2K")
    camera: Optional[FreezoneImageCameraConfig] = Field(
        default=None,
        description="可选摄像机参数，用于补充镜头语言和摄影机规格",
    )
    style: Optional[FreezoneImageStyleConfig] = Field(
        default=None,
        description="可选风格模板参数，用于把内置风格模板注入图片提示词",
    )
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Optional[str] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )


class FreezoneTemplateEditRequest(BaseModel):
    """九宫格下拉能力统一请求。

    本质上都是基于一张源图，叠加不同的提示词模板后走同一条图编辑链路。
    """

    source_url: str = Field(description="源图静态地址，作为图生图的 base 图")
    mode: Literal[
        "multi_camera_nine_grid",
        "story_pitch_four_grid",
        "character_face_three_view",
        "product_three_view",
        "storyboard_25_grid",
        "cinematic_light_correction",
        "character_three_view_generation",
        "image_projection_after_3s",
        "image_projection_before_5s",
    ] = Field(
        description=(
            "模板模式。分别对应：多机位九宫格 / 剧情推演四宫格 / 角色脸部三视图 / "
            "产品三视图 / 25宫格连贯分镜 / 电影级光影校正 / 角色三视图生成 / "
            "画面推演-3秒后 / 画面推演-5秒前"
        )
    )
    prompt: str = Field(default="", description="用户补充提示词，可为空")
    image_size: str = Field(default="2K", description="输出分辨率档位，默认 2K")
    camera: Optional[FreezoneImageCameraConfig] = Field(
        default=None,
        description="可选摄像机参数，用于补充镜头语言和摄影机规格",
    )
    style: Optional[FreezoneImageStyleConfig] = Field(
        default=None,
        description="可选风格模板参数，用于把内置风格模板注入图片提示词",
    )
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Optional[str] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )


class FreezoneUpscaleRequest(BaseModel):
    """高清放大请求。

    使用图片模型 + 提示词方式做高清放大与修复。
    """

    source_url: str = Field(description="待高清放大的源图静态地址")
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Optional[str] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )
    camera: Optional[FreezoneImageCameraConfig] = Field(
        default=None,
        description="可选摄像机参数，用于补充镜头语言和摄影机规格",
    )
    style: Optional[FreezoneImageStyleConfig] = Field(
        default=None,
        description="可选风格模板参数，用于把内置风格模板注入图片提示词",
    )
    scale_factor: Literal[2, 4, 6] = Field(
        default=2,
        description="放大倍数，可选 2 / 4 / 6",
    )
    image_size: str = Field(default="2K", description="输出分辨率档位，默认 2K")


class FreezoneOutpaintRequest(BaseModel):
    """扩图请求。

    基于一张源图向外补画，保留中心主体和原始构图。
    """

    source_url: str = Field(description="待扩图的源图静态地址，作为图生图的 base 图")
    target_aspect_ratio: Literal["original", "1:1", "4:3", "3:4", "16:9", "9:16"] = (
        Field(
            default="original",
            description="目标比例。original 表示保持原图比例，其余值表示扩展到指定比例",
        )
    )
    num_images: int = Field(
        default=1,
        ge=1,
        le=4,
        description="目标生成图片数量。当前后端单次任务只支持 1 张，预留该字段用于前端协议对齐",
    )
    camera: Optional[FreezoneImageCameraConfig] = Field(
        default=None,
        description="可选摄像机参数，用于补充镜头语言和摄影机规格",
    )
    style: Optional[FreezoneImageStyleConfig] = Field(
        default=None,
        description="可选风格模板参数，用于把内置风格模板注入图片提示词",
    )
    image_size: str = Field(default="2K", description="输出分辨率档位，默认 2K")
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Optional[str] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )


class FreezoneRedrawRequest(BaseModel):
    """重绘请求。

    统一承接整体重绘和局部擦除：
    - 不传 mask_url：整体/局部自由重绘
    - 传 mask_url：仅在 mask 透明区域内按 prompt 执行局部编辑
    """

    source_url: str = Field(description="待重绘的源图静态地址，作为图生图的 base 图")
    mask_url: Optional[str] = Field(
        default=None,
        description="可选的遮罩图静态地址。传入后表示走局部擦除/局部重绘模式",
    )
    aspect_ratio: Literal["original", "1:1", "4:3", "3:4", "16:9", "9:16"] = Field(
        default="original",
        description="目标比例。original 表示保持原图比例，其余值表示按指定比例重绘",
    )
    num_images: int = Field(
        default=1,
        ge=1,
        le=4,
        description="目标生成图片数量。当前后端单次任务只支持 1 张，预留该字段用于前端协议对齐",
    )
    prompt: str = Field(default="", description="重绘要求或补充提示词")
    camera: Optional[FreezoneImageCameraConfig] = Field(
        default=None,
        description="可选摄像机参数，用于补充镜头语言和摄影机规格",
    )
    style: Optional[FreezoneImageStyleConfig] = Field(
        default=None,
        description="可选风格模板参数，用于把内置风格模板注入图片提示词",
    )
    image_size: str = Field(default="2K", description="输出分辨率档位，默认 2K")
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Optional[str] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )


class FreezoneRelightRequest(BaseModel):
    """打光参考图编辑请求。

    基于一张源图和一张打光参考图，重塑当前画面的光照氛围。
    """

    source_url: str = Field(description="待打光的源图静态地址，作为图生图的 base 图")
    lighting_reference_url: Optional[str] = Field(
        default=None,
        description="打光参考图静态地址，用于提供光照方向、强弱和氛围参考",
    )
    scope: Literal["global", "local"] = Field(
        default="global",
        description="打光作用范围：global 表示整体打光，local 表示局部打光",
    )
    smart_mode: bool = Field(default=True, description="是否启用智能模式")
    brightness: int = Field(default=50, ge=0, le=100, description="亮度强度，0-100")
    color_hex: str = Field(
        default="#ffffff",
        description="用于控制主光源颜色或整体画面色调的十六进制色值，例如 #ffffff",
    )
    color_temperature_kelvin: Optional[int] = Field(
        default=None,
        ge=1500,
        le=12000,
        description="主光源色温 Kelvin 值，适用于可拖动色温轴",
    )
    key_light_direction: Literal["left", "top", "right", "front", "bottom", "back"] = (
        Field(
            default="front",
            description="主光源方向",
        )
    )
    rim_light: bool = Field(default=False, description="是否添加轮廓光")
    prompt: str = Field(default="", description="用户补充提示词，可为空")
    image_size: str = Field(default="2K", description="输出分辨率档位，默认 2K")
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Optional[str] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )


class FreezoneMarkDetectRequest(BaseModel):
    """局部元素标记识别请求。"""

    source_url: str = Field(description="待识别图片静态地址")
    point_x: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="点击点归一化横坐标，范围 0-1"
    )
    point_y: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="点击点归一化纵坐标，范围 0-1"
    )
    box_x: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="框选左上角归一化横坐标，范围 0-1"
    )
    box_y: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="框选左上角归一化纵坐标，范围 0-1"
    )
    box_width: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="框选归一化宽度，范围 0-1"
    )
    box_height: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="框选归一化高度，范围 0-1"
    )


class FreezoneMarkDetectData(BaseModel):
    """局部元素标记识别结果。"""

    mark: FreezoneVideoMark
    model: str


class FreezoneMarkDetectResponse(BaseModel):
    ok: bool
    data: FreezoneMarkDetectData


class FreezoneImageReversePromptRequest(BaseModel):
    """图反推提示词请求。"""

    source_url: str = Field(description="待分析图片静态地址")
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )


class FreezoneImageReversePromptData(BaseModel):
    """图反推提示词结果。"""

    prompt: str


class FreezoneImageReversePromptResponse(BaseModel):
    ok: bool
    data: FreezoneImageReversePromptData


class FreezoneStageAssetAcceptedData(BaseModel):
    task_type: str
    job_id: str
    task_key: str
    scope: str
    scene_id: str
    step: str


class FreezoneStageAssetAcceptedResponse(BaseModel):
    ok: Literal[True] = True
    data: FreezoneStageAssetAcceptedData


__all__ = [
    "FreezoneCharacterMultiViewRequest",
    "FreezoneEditRequest",
    "FreezoneGenRequest",
    "FreezoneImageCameraConfig",
    "FreezoneImageReversePromptData",
    "FreezoneImageReversePromptRequest",
    "FreezoneImageReversePromptResponse",
    "FreezoneImageStyleConfig",
    "FreezoneImageTo3GSRequest",
    "FreezoneMarkDetectData",
    "FreezoneMarkDetectRequest",
    "FreezoneMarkDetectResponse",
    "FreezoneOutpaintRequest",
    "FreezoneRedrawRequest",
    "FreezoneRelightRequest",
    "FreezoneStageAssetAcceptedData",
    "FreezoneStageAssetAcceptedResponse",
    "FreezoneTemplateEditRequest",
    "FreezoneUpscaleRequest",
]
