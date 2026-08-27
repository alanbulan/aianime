"""Image-to-Video 视频生成模块。

使用 Image-to-Video API 将首帧图像转换为动态视频。
"""

import asyncio
import base64
import hashlib
import json
import logging
import mimetypes
import os
import re
import subprocess
import uuid
from abc import ABC
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import quote, urlparse

import aiohttp

from ai_anime.modules.model_usage.public import (
    is_insufficient_credits_error,
    runtime_model_capability,
)
from ai_anime.modules.production.domain.video_model import (
    SEEDANCE2_DEFAULT_MIN_DURATION,
    is_seedance2_model,
    normalize_video_generation_duration,
    video_output_size,
)
from ai_anime.modules.task_execution.public import TaskCancelled, TaskTimedOut
from ai_anime.modules.task_execution.public import run_project_subprocess
from ai_anime.modules.model_usage.public import (
    record_video_request,
    update_video_request_status,
)

COMMERCIAL_VIDEO_HTTP_TIMEOUT_SECONDS = 1800.0
COMMERCIAL_VIDEO_DOWNLOAD_ATTEMPTS = 3
logger = logging.getLogger(__name__)


def _run_video_subprocess(cmd: list[str], *, timeout: int = 30 * 60) -> subprocess.CompletedProcess:
    return run_project_subprocess(cmd, capture_output=True, text=True, timeout=timeout)


class VideoGenStatus(Enum):
    """视频生成状态。"""

    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


@dataclass
class VideoGenResult:
    """视频生成结果。"""

    status: VideoGenStatus
    video_url: Optional[str] = None
    video_path: Optional[str] = None
    last_frame_url: Optional[str] = None
    last_frame_path: Optional[str] = None
    task_id: Optional[str] = None
    error: Optional[str] = None
    duration_seconds: float = 0.0


class VideoGeneratorBase(ABC):
    """视频生成器基类。

    定义 Image-to-Video 生成的标准接口。
    """

    async def generate(
        self,
        image_path: Optional[str],
        prompt: str,
        output_path: str,
        aspect_ratio: str = "16:9",
        duration: float = 5.0,
        poll_interval: float = 5.0,
        max_polls: int = 60,
    ) -> VideoGenResult:
        """完整生成流程：提交 + 轮询 + 下载。

        Args:
            image_path: 首帧图像路径
            prompt: 动作描述
            output_path: 输出视频路径
            aspect_ratio: 宽高比
            duration: 目标时长（秒）
            poll_interval: 轮询间隔（秒）
            max_polls: 最大轮询次数

        Returns:
            生成结果
        """
        # 默认实现，子类可覆盖
        raise NotImplementedError("Subclass should implement generate()")


@dataclass
class ShotReference:
    """视频模型的本地或远程参考素材。"""

    type: str  # "image" / "video" / "audio"
    path: str  # 本地文件路径
    role: str  # "首帧" / "角色参考" / "场景参考" / "配乐" / "音色参考"
    field: str = ""  # 标准视频协议的 multipart 字段名；为空时按角色和类型推导


def _seedance2_config_mapping(value) -> dict:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return {"final_prompt": text}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def _seedance2_duration_from_config(config: dict, fallback: float) -> float:
    if "duration" not in config:
        return fallback
    try:
        return int(float(config.get("duration") or fallback))
    except (TypeError, ValueError):
        return fallback


_VIDEO_SUCCESS_STATUSES = {"completed", "succeeded"}
_VIDEO_FAILURE_STATUSES = {"failed", "cancelled", "canceled", "expired"}
_VIDEO_REFERENCE_FIELDS = {
    "image": "reference_images",
    "video": "reference_videos",
    "audio": "reference_audios",
}
_VIDEO_LOCAL_OPTION_KEYS = {
    "duration",
    "final_prompt",
    "mode",
    "ratio",
    "resolution",
}
_VIDEO_FORBIDDEN_TRANSPORT_KEYS = {
    "apikey",
    "authorization",
    "baseurl",
    "endpoint",
    "headers",
    "token",
    "xapikey",
    "xgoogapikey",
}


class CommercialVideoError(RuntimeError):
    """Standard video protocol failure."""

    def __init__(
        self,
        message: str,
        *,
        status: int = 0,
        request_id: str = "",
    ) -> None:
        super().__init__(message)
        self.status = status
        self.request_id = request_id


class CommercialVideoGenerator(VideoGeneratorBase):
    """Generate videos through the selected cloud or BYOK /v1 endpoint."""

    def __init__(
        self,
        *,
        model_role: str,
        model: str | None = None,
        model_selector: str | None = None,
        resolution: str | None = None,
        generate_audio: bool | None = None,
    ) -> None:
        from ai_anime.modules.model_usage.public import (
            get_effective_newapi_gateway_config,
        )
        from ai_anime.modules.production.infrastructure.media_generation_settings import (
            DEFAULT_VIDEO_RESOLUTION,
        )
        from ai_anime.modules.model_usage.public import resolve_model_for_role

        gateway = get_effective_newapi_gateway_config()
        self.access_mode = str(gateway.mode or "").strip().lower()
        if self.access_mode != "mixed":
            raise ValueError("商业模型访问模式必须是 mixed")
        self.base_url = str(gateway.base_url or "").strip().rstrip("/")
        self.api_key = str(gateway.api_key or "").strip()
        self.model_role = str(model_role or "").strip().upper()
        self.resolution = str(resolution or DEFAULT_VIDEO_RESOLUTION).strip()
        self.generate_audio = generate_audio
        if not self.base_url:
            raise ValueError("当前商业模型访问未配置 Base URL")
        if self.model_role not in {
            "VIDEO_TEXT_TO_VIDEO",
            "VIDEO_IMAGE_TO_VIDEO",
            "VIDEO_FIRST_LAST_FRAME",
            "VIDEO_IMAGE_REFERENCE",
            "VIDEO_ALL_REFERENCE",
            "VIDEO_EDIT",
        }:
            raise ValueError("视频模型用途无效")
        self.model = str(model or "").strip() or resolve_model_for_role(self.model_role)
        self.model_selector = str(model_selector or "").strip()

    @property
    def headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "X-AI-Anime-Model-Role": self.model_role,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if self.model_selector:
            headers["X-AI-Anime-Model-Selector"] = self.model_selector
        return headers

    @staticmethod
    def _normalized_option_key(value: object) -> str:
        return re.sub(r"[^a-z0-9]", "", str(value or "").strip().lower())

    @classmethod
    def _reject_transport_options(
        cls,
        value: object,
        *,
        path: str = "video request",
    ) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                key_text = str(key or "").strip()
                if cls._normalized_option_key(key_text) in _VIDEO_FORBIDDEN_TRANSPORT_KEYS:
                    raise ValueError(f"{path} 禁止携带传输配置: {key_text}")
                cls._reject_transport_options(item, path=f"{path}.{key_text}")
        elif isinstance(value, (list, tuple)):
            for index, item in enumerate(value):
                cls._reject_transport_options(item, path=f"{path}[{index}]")

    @staticmethod
    def _request_id(headers: object, payload: object = None) -> str:
        getter = getattr(headers, "get", lambda _name: "")
        for name in ("x-request-id", "x-newapi-request-id", "x-oneapi-request-id"):
            value = getter(name)
            if value:
                return str(value)
        if isinstance(payload, dict):
            for name in ("request_id", "requestId"):
                value = payload.get(name)
                if value:
                    return str(value)
        return ""

    @staticmethod
    def _error_message(payload: object, fallback: str) -> str:
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                message = error.get("message")
                if message:
                    return str(message)
            elif error:
                return str(error)
            for key in ("message", "detail", "fail_reason"):
                value = payload.get(key)
                if value:
                    return str(value)
        return fallback

    @staticmethod
    def _size(aspect_ratio: str, resolution: str) -> str:
        return video_output_size(aspect_ratio, resolution)

    @staticmethod
    def _form_value(value: object) -> str:
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        return str(value)

    @staticmethod
    def _reference_field(reference: ShotReference) -> str:
        explicit = str(getattr(reference, "field", "") or "").strip()
        if explicit:
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,127}", explicit):
                raise ValueError(f"无效的视频媒体字段名: {explicit}")
            if (
                CommercialVideoGenerator._normalized_option_key(explicit)
                in _VIDEO_FORBIDDEN_TRANSPORT_KEYS
            ):
                raise ValueError(f"视频媒体字段禁止使用传输配置名: {explicit}")
            return explicit
        role = str(reference.role or "").strip().lower()
        if "首帧" in role or role in {"first_frame", "input_reference"}:
            return "input_reference"
        if "尾帧" in role or role in {"last_frame", "end_frame"}:
            return "last_frame"
        media_type = str(reference.type or "image").strip().lower()
        try:
            return _VIDEO_REFERENCE_FIELDS[media_type]
        except KeyError as exc:
            raise ValueError(f"不支持的视频参考素材类型: {media_type}") from exc

    @staticmethod
    def _media_part(value: str, field_name: str) -> tuple[bytes, str, str] | str:
        clean = str(value or "").strip()
        if not clean:
            raise ValueError(f"视频媒体字段 {field_name} 不能为空")
        if clean.startswith(("http://", "https://")):
            return clean
        if clean.startswith("data:"):
            import base64

            header, separator, encoded = clean.partition(",")
            if not separator or ";base64" not in header:
                raise ValueError(f"视频媒体字段 {field_name} 的 data URL 无效")
            mime_type = header.removeprefix("data:").split(";", 1)[0] or "application/octet-stream"
            extension = mimetypes.guess_extension(mime_type) or ".bin"
            return base64.b64decode(encoded), f"{field_name}{extension}", mime_type

        path = Path(clean)
        if not path.is_file():
            raise FileNotFoundError(f"视频参考素材不存在: {path}")
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return path.read_bytes(), path.name, mime_type

    def _build_request(
        self,
        *,
        image_path: str | None,
        last_frame_path: str | None,
        references: list[ShotReference],
        prompt: str,
        aspect_ratio: str,
        duration: float,
        kwargs: dict,
    ) -> tuple[dict[str, object], list[tuple[str, tuple[bytes, str, str] | str]], bool]:
        config = _seedance2_config_mapping(kwargs.get("seedance2_config"))
        self._reject_transport_options(config, path="seedance2_config")
        self._reject_transport_options(
            {
                key: value
                for key, value in kwargs.items()
                if key != "seedance2_config"
            }
        )
        configured_duration = _seedance2_duration_from_config(config, duration)
        capability = runtime_model_capability(self.model)
        uses_seedance2 = is_seedance2_model(
            self.model,
            getattr(capability, "video_profile", None),
        )
        minimum_duration = getattr(
            capability,
            "video_generation_min_seconds",
            None,
        )
        if uses_seedance2:
            minimum_duration = max(
                float(minimum_duration or 0),
                SEEDANCE2_DEFAULT_MIN_DURATION,
            )
        duration_seconds = normalize_video_generation_duration(
            configured_duration,
            duration,
            minimum_seconds=minimum_duration,
            maximum_seconds=getattr(
                capability,
                "video_generation_max_seconds",
                None,
            ),
        )
        resolution = str(config.get("resolution") or self.resolution).strip()
        ratio = str(config.get("ratio") or aspect_ratio or "16:9").strip()

        payload: dict[str, object] = {
            "model": self.model,
            "prompt": str(config.get("final_prompt") or prompt or "").strip(),
            "seconds": str(duration_seconds),
            "size": self._size(ratio, resolution),
        }
        if not payload["prompt"]:
            raise ValueError("视频提示词不能为空")

        audio_override = kwargs.get("audio")
        if audio_override is not None:
            payload["generate_audio"] = bool(audio_override)
        elif self.generate_audio is not None:
            payload["generate_audio"] = bool(self.generate_audio)

        for key, value in config.items():
            normalized = str(key or "").strip()
            if (
                not normalized
                or normalized in _VIDEO_LOCAL_OPTION_KEYS
                or value is None
            ):
                continue
            payload[normalized] = value
        for key in ("audio_setting", "human_review"):
            value = kwargs.get(key)
            if value is not None:
                payload[key] = value

        media: list[tuple[str, tuple[bytes, str, str] | str]] = []
        seen: set[tuple[str, str]] = set()

        def append_media(field_name: str, source: str | None) -> None:
            clean_source = str(source or "").strip()
            if not clean_source or (field_name, clean_source) in seen:
                return
            seen.add((field_name, clean_source))
            media.append((field_name, self._media_part(clean_source, field_name)))

        append_media("input_reference", image_path)
        append_media("last_frame", last_frame_path)
        for reference in references:
            append_media(self._reference_field(reference), reference.path)

        return payload, media, bool(config.get("return_last_frame"))

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, object] | None = None,
        media: list[tuple[str, tuple[bytes, str, str] | str]] | None = None,
        idempotency_key: str = "",
    ) -> tuple[dict, str]:
        headers = self.headers
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        form: aiohttp.FormData | None = None
        json_payload: dict[str, object] | None = payload
        if media:
            form = aiohttp.FormData()
            for key, value in (payload or {}).items():
                form.add_field(key, self._form_value(value))
            for field_name, item in media:
                if isinstance(item, str):
                    form.add_field(field_name, item)
                else:
                    content, filename, content_type = item
                    form.add_field(
                        field_name,
                        content,
                        filename=filename,
                        content_type=content_type,
                    )
            json_payload = None

        timeout = aiohttp.ClientTimeout(total=COMMERCIAL_VIDEO_HTTP_TIMEOUT_SECONDS)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.request(
                    method,
                    f"{self.base_url}/{path.lstrip('/')}",
                    headers=headers,
                    json=json_payload,
                    data=form,
                ) as response:
                    text = await response.text()
                    try:
                        data = json.loads(text) if text else {}
                    except json.JSONDecodeError:
                        data = {}
                    request_id = self._request_id(response.headers, data)
                    if not 200 <= response.status < 300:
                        message = self._error_message(
                            data,
                            text[:500] or f"HTTP {response.status}",
                        )
                        raise CommercialVideoError(
                            message,
                            status=response.status,
                            request_id=request_id,
                        )
                    if not isinstance(data, dict):
                        raise CommercialVideoError(
                            "视频接口返回值不是 JSON 对象",
                            status=response.status,
                            request_id=request_id,
                        )
                    protocol_error = (
                        self._error_message(data, "") if data.get("error") else ""
                    )
                    if protocol_error:
                        raise CommercialVideoError(
                            protocol_error,
                            status=response.status,
                            request_id=request_id,
                        )
                    return data, request_id
        except CommercialVideoError:
            raise
        except asyncio.TimeoutError as exc:
            raise CommercialVideoError("视频接口请求超时") from exc
        except aiohttp.ClientError as exc:
            raise CommercialVideoError(
                f"视频接口传输失败: {exc.__class__.__name__}"
            ) from exc

    @staticmethod
    def _download_partial_path(output: Path, task_id: str) -> Path:
        task_digest = hashlib.sha256(task_id.encode("utf-8")).hexdigest()[:16]
        return output.with_name(f".{output.name}.{task_digest}.part")

    @staticmethod
    def _validate_downloaded_video(
        path: Path,
        *,
        content_type: str,
        request_id: str,
    ) -> None:
        normalized_type = content_type.split(";", 1)[0].strip().lower()
        if normalized_type and normalized_type not in {
            "video/mp4",
            "application/mp4",
            "application/octet-stream",
        }:
            raise CommercialVideoError(
                f"视频结果接口返回了非视频内容: {normalized_type}",
                status=200,
                request_id=request_id,
            )
        with path.open("rb") as stream:
            header = stream.read(64)
        if len(header) < 12 or b"ftyp" not in header[:32]:
            raise CommercialVideoError(
                "视频结果不是有效的 MP4 文件",
                status=200,
                request_id=request_id,
            )

    async def _download_content(self, task_id: str, output_path: str) -> None:
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        partial = self._download_partial_path(output, task_id)
        last_error: Exception | None = None
        timeout = aiohttp.ClientTimeout(total=COMMERCIAL_VIDEO_HTTP_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for attempt in range(COMMERCIAL_VIDEO_DOWNLOAD_ATTEMPTS):
                existing_bytes = partial.stat().st_size if partial.is_file() else 0
                headers = {**self.headers, "Accept": "*/*"}
                if existing_bytes:
                    headers["Range"] = f"bytes={existing_bytes}-"
                try:
                    async with session.get(
                        f"{self.base_url}/videos/{quote(task_id, safe='')}/content",
                        headers=headers,
                    ) as response:
                        response_request_id = self._request_id(response.headers)
                        response_content_type = str(
                            response.headers.get("Content-Type") or ""
                        )
                        if not 200 <= response.status < 300:
                            text = await response.text()
                            try:
                                payload = json.loads(text)
                            except json.JSONDecodeError:
                                payload = {}
                            raise CommercialVideoError(
                                self._error_message(
                                    payload,
                                    text[:500] or f"HTTP {response.status}",
                                ),
                                status=response.status,
                                request_id=self._request_id(response.headers, payload),
                            )

                        append = response.status == 206 and existing_bytes > 0
                        if append:
                            content_range = str(
                                response.headers.get("Content-Range") or ""
                            ).strip()
                            if not content_range.lower().startswith(
                                f"bytes {existing_bytes}-"
                            ):
                                raise CommercialVideoError(
                                    "视频续传响应的 Content-Range 无效",
                                    status=response.status,
                                    request_id=self._request_id(response.headers),
                                )
                        write_mode = "ab" if append else "wb"
                        with partial.open(write_mode) as stream:
                            async for chunk in response.content.iter_chunked(64 * 1024):
                                if chunk:
                                    stream.write(chunk)
                    if not partial.is_file() or partial.stat().st_size <= 0:
                        raise CommercialVideoError("视频内容下载结果为空")
                    try:
                        self._validate_downloaded_video(
                            partial,
                            content_type=response_content_type,
                            request_id=response_request_id,
                        )
                    except CommercialVideoError:
                        partial.unlink(missing_ok=True)
                        raise
                    os.replace(partial, output)
                    return
                except (aiohttp.ClientError, asyncio.TimeoutError, CommercialVideoError) as exc:
                    last_error = exc
                    retryable = not isinstance(exc, CommercialVideoError) or (
                        exc.status == 0 or exc.status in {408, 429} or exc.status >= 500
                    )
                    if not retryable or attempt + 1 >= COMMERCIAL_VIDEO_DOWNLOAD_ATTEMPTS:
                        break
                    await asyncio.sleep(min(2.0, 0.25 * (2**attempt)))
        if isinstance(last_error, CommercialVideoError):
            raise last_error
        if last_error is not None:
            raise CommercialVideoError(
                f"视频内容下载失败: {last_error.__class__.__name__}"
            ) from last_error
        raise CommercialVideoError("视频内容下载失败")

    async def _cancel(self, task_id: str) -> CommercialVideoError | None:
        try:
            await self._request_json("DELETE", f"videos/{quote(task_id, safe='')}")
            return None
        except CommercialVideoError as exc:
            return exc
        except Exception as exc:
            return CommercialVideoError(
                f"视频取消请求失败: {exc.__class__.__name__}"
            )

    @staticmethod
    def _extract_last_frame(output_path: str) -> str:
        from ai_anime.modules.production.infrastructure.media_generation_settings import (
            FFMPEG_PATH,
        )

        video_path = Path(output_path)
        frame_path = (
            video_path.parent
            / "returned_last_frames"
            / f"{video_path.stem}.png"
        )
        frame_path.parent.mkdir(parents=True, exist_ok=True)
        result = _run_video_subprocess(
            [
                FFMPEG_PATH,
                "-y",
                "-sseof",
                "-0.1",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                str(frame_path),
            ],
            timeout=120,
        )
        if result.returncode != 0 or not frame_path.is_file():
            raise RuntimeError(result.stderr[-500:] or "ffmpeg 未生成尾帧")
        return frame_path.as_posix()

    @staticmethod
    def _extract_returned_last_frame_url(task: dict) -> str:
        if not isinstance(task, dict):
            return ""
        preferred_keys = (
            "returned_last_frame",
            "return_last_frame",
            "last_frame_output",
            "last_frame_url",
            "last_frame_image",
            "last_frame",
            "tail_frame_url",
            "tail_frame_image",
            "end_frame_url",
            "end_frame_image",
        )
        image_collection_keys = (
            "image_url",
            "image_urls",
            "images",
            "output_images",
            "last_frames",
            "frames",
        )

        def first_image_url(value: object) -> str:
            if isinstance(value, str) and value.startswith(
                ("http://", "https://", "data:")
            ):
                parsed = urlparse(value)
                path = parsed.path.lower()
                if value.startswith("data:video/") or path.endswith(
                    (".mp4", ".mov", ".webm", ".mkv", ".avi")
                ):
                    return ""
                return value
            if isinstance(value, dict):
                for key in (*preferred_keys, "url", *image_collection_keys):
                    found = first_image_url(value.get(key))
                    if found:
                        return found
                for child in value.values():
                    found = first_image_url(child)
                    if found:
                        return found
            elif isinstance(value, list):
                for child in value:
                    found = first_image_url(child)
                    if found:
                        return found
            return ""

        containers: list[dict] = []
        for value in (
            task.get("metadata"),
            task.get("response"),
            task.get("result"),
            task.get("output"),
            task.get("data"),
            task,
        ):
            if isinstance(value, dict):
                containers.append(value)
        for container in containers:
            for key in (*preferred_keys, *image_collection_keys):
                found = first_image_url(container.get(key))
                if found:
                    return found
        return ""

    @staticmethod
    def _returned_last_frame_output_path(
        output_path: str,
        last_frame_url: str,
    ) -> Path:
        suffix = ""
        if last_frame_url.startswith("data:"):
            media_type = last_frame_url.partition(",")[0].split(";", 1)[0]
            suffix = mimetypes.guess_extension(media_type.removeprefix("data:")) or ""
        else:
            suffix = Path(urlparse(last_frame_url).path).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
            suffix = ".png"
        video_path = Path(output_path)
        return (
            video_path.parent
            / "returned_last_frames"
            / f"{video_path.stem}{suffix}"
        )

    async def _download_returned_last_frame(
        self,
        last_frame_url: str,
        output_path: str,
    ) -> str:
        target = self._returned_last_frame_output_path(output_path, last_frame_url)
        target.parent.mkdir(parents=True, exist_ok=True)
        if last_frame_url.startswith("data:"):
            header, separator, encoded = last_frame_url.partition(",")
            if not separator or ";base64" not in header:
                raise CommercialVideoError("视频接口返回的尾帧 data URL 无效")
            content = base64.b64decode(encoded)
        else:
            timeout = aiohttp.ClientTimeout(total=120)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(last_frame_url) as response:
                    if not 200 <= response.status < 300:
                        raise CommercialVideoError(
                            f"视频接口尾帧下载失败: HTTP {response.status}",
                            status=response.status,
                            request_id=self._request_id(response.headers),
                        )
                    content = await response.read()
        if not content:
            raise CommercialVideoError("视频接口返回的尾帧为空")
        temporary = target.with_suffix(f"{target.suffix}.part")
        temporary.write_bytes(content)
        os.replace(temporary, target)
        return target.as_posix()

    async def generate(
        self,
        image_path: str | None,
        prompt: str,
        output_path: str,
        aspect_ratio: str = "16:9",
        duration: float = 5.0,
        poll_interval: float = 1.0,
        max_polls: int = 360,
        on_log: Callable[[str], None] | None = None,
        on_progress: Callable[[float], None] | None = None,
        last_frame_path: str | None = None,
        references: list[ShotReference] | None = None,
        **kwargs,
    ) -> VideoGenResult:
        def log(message: str) -> None:
            if on_log:
                on_log(message)

        def progress(value: float) -> None:
            if on_progress:
                on_progress(value)

        task_id = ""
        request_id = ""
        project_output_dir = str(kwargs.get("project_output_dir") or "").strip()
        try:
            payload, media, return_last_frame = self._build_request(
                image_path=image_path,
                last_frame_path=last_frame_path,
                references=list(references or []),
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                duration=duration,
                kwargs=kwargs,
            )
            duration_seconds = float(payload["seconds"])
            idempotency_key = str(uuid.uuid4())
            log(
                f"正在提交视频任务 "
                f"(access_mode={self.access_mode}, model={self.model}, "
                f"{int(duration_seconds)}s, size={payload['size']})..."
            )
            progress(0.1)
            submitted, request_id = await self._request_json(
                "POST",
                "videos",
                payload=payload,
                media=media,
                idempotency_key=idempotency_key,
            )
            task_id = str(submitted.get("id") or "").strip()
            if not task_id:
                raise CommercialVideoError(
                    "视频提交响应缺少 id",
                    request_id=request_id,
                )
            if project_output_dir:
                record_video_request(
                    project_output_dir=project_output_dir,
                    request_id=task_id,
                    provider=self.access_mode,
                    model_name=self.model,
                    episode=kwargs.get("episode"),
                    beat_num=kwargs.get("beat_num"),
                    task_type=str(kwargs.get("task_type") or ""),
                    duration_seconds=duration_seconds,
                    cost_estimate=kwargs.get("cost_estimate"),
                )
            log(f"视频任务已提交: {task_id}")
            progress(0.2)

            for poll_count in range(max_polls):
                task, _ = await self._request_json(
                    "GET",
                    f"videos/{quote(task_id, safe='')}",
                )
                status = str(task.get("status") or "").strip().lower()
                progress(0.2 + (poll_count / max(max_polls, 1)) * 0.7)

                if status in _VIDEO_SUCCESS_STATUSES:
                    log("视频生成完成，正在下载...")
                    await self._download_content(task_id, output_path)
                    returned_last_frame_url = ""
                    extracted_last_frame = None
                    if return_last_frame:
                        returned_last_frame_url = self._extract_returned_last_frame_url(
                            task
                        )
                        if returned_last_frame_url:
                            try:
                                extracted_last_frame = (
                                    await self._download_returned_last_frame(
                                        returned_last_frame_url,
                                        output_path,
                                    )
                                )
                                log("已保存供应商返回尾帧")
                            except Exception as exc:
                                log(f"供应商返回尾帧下载失败: {exc}")
                        if not extracted_last_frame:
                            try:
                                extracted_last_frame = await asyncio.to_thread(
                                    self._extract_last_frame,
                                    output_path,
                                )
                                log("已从成片提取尾帧作为兜底")
                            except Exception as exc:
                                log(f"本地尾帧提取失败: {exc}")
                    if project_output_dir:
                        update_video_request_status(
                            project_output_dir=project_output_dir,
                            request_id=task_id,
                            status="completed",
                        )
                    progress(1.0)
                    return VideoGenResult(
                        status=VideoGenStatus.DONE,
                        video_path=output_path,
                        last_frame_url=returned_last_frame_url or None,
                        last_frame_path=extracted_last_frame,
                        task_id=task_id,
                        duration_seconds=duration_seconds,
                    )

                if status in _VIDEO_FAILURE_STATUSES:
                    message = self._error_message(task, "视频生成失败")
                    if project_output_dir:
                        update_video_request_status(
                            project_output_dir=project_output_dir,
                            request_id=task_id,
                            status="failed",
                            error_message=message,
                        )
                    return VideoGenResult(
                        status=VideoGenStatus.FAILED,
                        error=message,
                        task_id=task_id,
                    )

                if poll_count % 5 == 0:
                    log(f"视频任务状态: {status or 'queued'}")
                exponent = min(3, max(0, poll_count - 4))
                delay = min(5.0, max(0.1, poll_interval) * (2**exponent))
                await asyncio.sleep(delay)

            cancel_error = await self._cancel(task_id)
            message = "视频任务轮询超时"
            if cancel_error is not None:
                log(f"视频任务取消未确认: {cancel_error}")
                message = f"{message}；远端取消未确认"
            if project_output_dir:
                update_video_request_status(
                    project_output_dir=project_output_dir,
                    request_id=task_id,
                    status="failed",
                    error_message=message,
                )
            return VideoGenResult(
                status=VideoGenStatus.FAILED,
                error=message,
                task_id=task_id,
            )
        except asyncio.CancelledError:
            if task_id:
                cancel_error = await self._cancel(task_id)
                if cancel_error is not None:
                    log(f"视频任务取消未确认: {cancel_error}")
            raise
        except (TaskCancelled, TaskTimedOut):
            if task_id:
                cancel_error = await self._cancel(task_id)
                if cancel_error is not None:
                    log(f"视频任务取消未确认: {cancel_error}")
            raise
        except Exception as exc:
            if project_output_dir and task_id:
                update_video_request_status(
                    project_output_dir=project_output_dir,
                    request_id=task_id,
                    status="failed",
                    error_message=str(exc),
                )
            if isinstance(exc, CommercialVideoError) and exc.request_id:
                log(f"视频网关 request_id: {exc.request_id}")
            if is_insufficient_credits_error(exc):
                raise
            return VideoGenResult(
                status=VideoGenStatus.FAILED,
                error=str(exc),
                task_id=task_id or None,
            )


def create_video_generator(
    *,
    model_role: str,
    **kwargs,
) -> VideoGeneratorBase:
    """Create the single commercial video adapter."""
    return CommercialVideoGenerator(
        model_role=model_role,
        **kwargs,
    )
