from __future__ import annotations

import uuid
from pathlib import Path
from types import SimpleNamespace

import aiohttp
import pytest

from ai_anime.modules.production.infrastructure.media_generation import (
    video_generator as video_module,
)
from ai_anime.modules.production.infrastructure.media_generation.video_generator import (
    CommercialVideoError,
    CommercialVideoGenerator,
    ShotReference,
    VideoGenStatus,
)


def _generator(
    monkeypatch: pytest.MonkeyPatch,
    *,
    mode: str = "mixed",
    base_url: str = "http://127.0.0.1:43123/v1",
    api_key: str = "loopback-token",
    model: str = "cloud-video-standard",
    model_role: str = "VIDEO_TEXT_TO_VIDEO",
    resolution: str | None = None,
    model_capabilities: list[dict] | None = None,
) -> CommercialVideoGenerator:
    from ai_anime.modules.model_usage import public as model_usage

    model_usage.configure_model_access(
        allows_custom_models=True,
        mode="mixed",
        model_assignments=[{"modelId": model, "role": model_role}],
        model_capabilities=model_capabilities,
    )
    monkeypatch.setattr(
        model_usage,
        "get_effective_model_gateway_transport_config",
        lambda: SimpleNamespace(
            mode=mode,
            base_url=base_url,
            api_key=api_key,
        ),
    )
    return CommercialVideoGenerator(
        model_role=model_role,
        resolution=resolution,
    )


def test_video_headers_use_only_the_authenticated_desktop_router(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generator = _generator(monkeypatch)
    assert generator.access_mode == "mixed"
    assert generator.headers == {
        "Accept": "application/json",
        "X-AI-Anime-Model-Role": "VIDEO_TEXT_TO_VIDEO",
        "Authorization": "Bearer loopback-token",
    }


def test_text_video_builds_standard_json_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generator = _generator(monkeypatch)

    payload, media, return_last_frame = generator._build_request(
        image_path=None,
        last_frame_path=None,
        references=[],
        prompt="角色缓慢转身，镜头向前推进",
        aspect_ratio="16:9",
        duration=5,
        kwargs={
            "video_config": {
                "resolution": "720p",
                "scene_optimize": "anime",
                "return_last_frame": True,
                "prompt_inputs_hash": "local-state-hash",
                "reference_image_paths": [r"C:\\project\\private-frame.png"],
                "selected_asset_keys": ["local-asset-key"],
                "text_overlay": {"text": "local overlay"},
            }
        },
    )

    assert payload == {
        "model": "cloud-video-standard",
        "prompt": "角色缓慢转身，镜头向前推进",
        "seconds": "5",
        "size": "1280x720",
        "ratio": "16:9",
        "scene_optimize": "anime",
        "return_last_frame": True,
    }
    assert media == []
    assert return_last_frame is True


def test_declared_size_request_preserves_exact_size_and_semantic_ratio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generator = _generator(
        monkeypatch,
        model="video-model-sized",
        model_role="VIDEO_IMAGE_TO_VIDEO",
        resolution="768x1344",
        model_capabilities=[
            {
                "modelId": "video-model-sized",
                "videoSizeOptions": [
                    "1344x768",
                    "768x1344",
                    "1024x1024",
                ],
            }
        ],
    )

    payload, _media, _return_last_frame = generator._build_request(
        image_path=None,
        last_frame_path=None,
        references=[],
        prompt="角色缓慢转身",
        aspect_ratio="9:16",
        duration=4,
        kwargs={},
    )

    assert payload["seconds"] == "4"
    assert payload["size"] == "768x1344"
    assert payload["ratio"] == "9:16"


def test_video_request_clamps_to_catalog_minimum_before_gateway_submission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = "video-model-duration-bounded"
    generator = _generator(
        monkeypatch,
        model=model,
        model_role="VIDEO_IMAGE_TO_VIDEO",
        model_capabilities=[
            {
                "modelId": model,
                "videoWorkflow": "advanced-reference",
                "videoGenerationMinSeconds": 4,
                "videoGenerationMaxSeconds": 15,
            }
        ],
    )

    payload, _media, _return_last_frame = generator._build_request(
        image_path=None,
        last_frame_path=None,
        references=[],
        prompt="短对白镜头",
        aspect_ratio="9:16",
        duration=0.768,
        kwargs={"video_config": {"duration": 1, "resolution": "720p"}},
    )

    assert payload["seconds"] == "4"


def test_video_request_rejects_duration_above_catalog_maximum(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = "video-model-duration-bounded"
    generator = _generator(
        monkeypatch,
        model=model,
        model_role="VIDEO_IMAGE_TO_VIDEO",
        model_capabilities=[
            {
                "modelId": model,
                "videoWorkflow": "advanced-reference",
                "videoGenerationMinSeconds": 4,
                "videoGenerationMaxSeconds": 15,
            }
        ],
    )

    with pytest.raises(ValueError, match="超过所选模型支持的最大时长"):
        generator._build_request(
            image_path=None,
            last_frame_path=None,
            references=[],
            prompt="过长镜头",
            aspect_ratio="9:16",
            duration=15.2,
            kwargs={"video_config": {"duration": 15}},
        )


def test_reference_video_builds_standard_multipart_parts(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    generator = _generator(monkeypatch)
    first_frame = tmp_path / "first.png"
    first_frame.write_bytes(b"png-data")

    payload, media, _return_last_frame = generator._build_request(
        image_path=str(first_frame),
        last_frame_path="https://media.example/last.png",
        references=[
            ShotReference(
                "image",
                "https://media.example/character.png",
                "角色参考",
                field="reference_images",
            ),
            ShotReference(
                "video",
                "https://media.example/motion.mp4",
                "动作参考",
                field="reference_videos",
            ),
        ],
        prompt="保持角色一致",
        aspect_ratio="9:16",
        duration=8,
        kwargs={"video_config": {"resolution": "1080p"}},
    )

    assert payload["size"] == "1080x1920"
    assert str(first_frame) not in str(payload)
    assert "https://media.example/last.png" not in str(payload)
    assert [field for field, _value in media] == [
        "input_reference",
        "last_frame",
        "reference_images",
        "reference_videos",
    ]
    first_part = media[0][1]
    assert isinstance(first_part, tuple)
    assert first_part[0] == b"png-data"
    assert first_part[1] == "first.png"
    assert media[1][1] == "https://media.example/last.png"


def test_h3_ref2va_preserves_twelve_mixed_parts_and_ordered_durations(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    model = "MiniMax-H3"
    generator = _generator(
        monkeypatch,
        model=model,
        model_capabilities=[
            {
                "modelId": model,
                "maxReferenceImages": 9,
                "maxReferenceVideos": 3,
                "maxReferenceAudios": 3,
                "maxReferenceTotal": 12,
                "referenceVideoMaxSeconds": 15,
                "referenceVideoTotalMaxSeconds": 15,
                "referenceAudioMaxSeconds": 15,
                "referenceAudioTotalMaxSeconds": 15,
            }
        ],
    )
    references: list[ShotReference] = []
    durations: dict[str, float] = {}
    for media_type, count, field_name in (
        ("image", 6, "reference_images"),
        ("video", 3, "reference_videos"),
        ("audio", 3, "reference_audios"),
    ):
        for index in range(1, count + 1):
            path = (
                tmp_path
                / f"{media_type}-{index}.{'png' if media_type == 'image' else 'mp4' if media_type == 'video' else 'wav'}"
            )
            path.write_bytes(f"{media_type}-{index}".encode())
            references.append(
                ShotReference(
                    media_type,
                    str(path),
                    f"{media_type}-{index}",
                    field=field_name,
                )
            )
            if media_type != "image":
                expected = [2.0, 3.0, 4.0] if media_type == "video" else [5.0, 4.0, 3.0]
                durations[str(path)] = expected[index - 1]
    monkeypatch.setattr(
        video_module,
        "get_audio_duration",
        lambda path: durations[str(path)],
    )

    payload, media, _return_last_frame = generator._build_request(
        image_path=None,
        last_frame_path=None,
        references=references,
        prompt="保持全部参考素材的角色、动作和声音一致",
        aspect_ratio="1:1",
        duration=5,
        kwargs={"video_config": {"resolution": "768p"}},
    )

    assert [name for name, _part in media] == [
        *(["reference_images"] * 6),
        *(["reference_videos"] * 3),
        *(["reference_audios"] * 3),
    ]
    assert payload["reference_video_durations"] == [2.0, 3.0, 4.0]
    assert payload["reference_audio_durations"] == [5.0, 4.0, 3.0]


@pytest.mark.parametrize(
    ("durations", "message"),
    [
        ([1.9], "below model limit 2s"),
        ([15.1], "exceeds model limit 15s"),
        ([8.0, 8.0], "total video reference duration 16s exceeds model limit 15s"),
    ],
)
def test_h3_ref2va_rejects_measured_duration_overflow_before_upload(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    durations: list[float],
    message: str,
) -> None:
    model = "MiniMax-H3"
    generator = _generator(
        monkeypatch,
        model=model,
        model_capabilities=[
            {
                "modelId": model,
                "maxReferenceVideos": 3,
                "maxReferenceTotal": 12,
                "referenceVideoMinSeconds": 2,
                "referenceVideoMaxSeconds": 15,
                "referenceVideoTotalMaxSeconds": 15,
            }
        ],
    )
    references: list[ShotReference] = []
    measured: dict[str, float] = {}
    for index, duration in enumerate(durations):
        path = tmp_path / f"video-{index}.mp4"
        path.write_bytes(b"video")
        measured[str(path)] = duration
        references.append(ShotReference("video", str(path), f"video-{index}"))
    monkeypatch.setattr(
        video_module,
        "get_audio_duration",
        lambda path: measured[str(path)],
    )

    with pytest.raises(ValueError, match=message):
        generator._build_request(
            image_path=None,
            last_frame_path=None,
            references=references,
            prompt="prompt",
            aspect_ratio="16:9",
            duration=5,
            kwargs={},
        )


@pytest.mark.parametrize(
    ("counts", "message"),
    [
        ((10, 0, 0), "image reference count 10 exceeds model limit 9"),
        ((7, 3, 3), "reference file count 13 exceeds model limit 12"),
    ],
)
def test_h3_ref2va_rejects_reference_overflow_before_upload(
    monkeypatch: pytest.MonkeyPatch,
    counts: tuple[int, int, int],
    message: str,
) -> None:
    model = "MiniMax-H3"
    generator = _generator(
        monkeypatch,
        model=model,
        model_capabilities=[
            {
                "modelId": model,
                "maxReferenceImages": 9,
                "maxReferenceVideos": 3,
                "maxReferenceAudios": 3,
                "maxReferenceTotal": 12,
            }
        ],
    )
    references = [
        ShotReference(media_type, f"https://media.example/{media_type}-{index}", "ref")
        for media_type, count in zip(("image", "video", "audio"), counts, strict=True)
        for index in range(count)
    ]

    with pytest.raises(ValueError, match=message):
        generator._build_request(
            image_path=None,
            last_frame_path=None,
            references=references,
            prompt="prompt",
            aspect_ratio="16:9",
            duration=5,
            kwargs={},
        )


@pytest.mark.parametrize(
    "options",
    [
        {"api_key": "request-key"},
        {"baseUrl": "https://bypass.example/v1"},
        {"metadata": {"Authorization": "Bearer bypass"}},
        {"headers": {"X-Provider": "bypass"}},
        {"endpoint": "https://bypass.example"},
        {"token": "request-token"},
        {"x-api-key": "request-key"},
        {"x-goog-api-key": "request-key"},
    ],
)
def test_request_level_transport_configuration_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
    options: dict,
) -> None:
    generator = _generator(monkeypatch)

    with pytest.raises(ValueError, match="禁止携带传输配置"):
        generator._build_request(
            image_path=None,
            last_frame_path=None,
            references=[],
            prompt="生成视频",
            aspect_ratio="16:9",
            duration=5,
            kwargs={"video_config": options},
        )


@pytest.mark.asyncio
async def test_http_adapter_selects_json_or_multipart_without_second_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generator = _generator(monkeypatch)
    calls: list[dict] = []

    class _Response:
        status = 200
        headers = {"X-Request-ID": "request-1"}

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def text(self) -> str:
            return '{"id":"invocation-1"}'

    class _Session:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def request(self, method: str, url: str, **kwargs):
            calls.append({"method": method, "url": url, **kwargs})
            return _Response()

    monkeypatch.setattr(video_module.aiohttp, "ClientSession", _Session)

    await generator._request_json(
        "POST",
        "videos",
        payload={"model": "cloud-video-standard", "prompt": "text"},
        idempotency_key="idem-json",
    )
    await generator._request_json(
        "POST",
        "videos",
        payload={"model": "cloud-video-standard", "prompt": "media"},
        media=[("input_reference", (b"png", "first.png", "image/png"))],
        idempotency_key="idem-media",
    )

    assert [call["url"] for call in calls] == [
        "http://127.0.0.1:43123/v1/videos",
        "http://127.0.0.1:43123/v1/videos",
    ]
    assert calls[0]["json"]["prompt"] == "text"
    assert calls[0]["data"] is None
    assert calls[0]["headers"]["Idempotency-Key"] == "idem-json"
    assert calls[1]["json"] is None
    assert isinstance(calls[1]["data"], aiohttp.FormData)
    assert calls[1]["headers"]["Idempotency-Key"] == "idem-media"


@pytest.mark.asyncio
async def test_http_200_error_envelope_is_not_a_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generator = _generator(monkeypatch)

    class _Response:
        status = 200
        headers = {"x-request-id": "request-protocol-error"}

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def text(self) -> str:
            return '{"error":{"code":"provider_failed","message":"video rejected"}}'

    class _Session:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def request(self, *_args, **_kwargs):
            return _Response()

    monkeypatch.setattr(video_module.aiohttp, "ClientSession", _Session)

    with pytest.raises(CommercialVideoError, match="video rejected") as exc_info:
        await generator._request_json("POST", "videos", payload={"model": "model"})

    assert exc_info.value.request_id == "request-protocol-error"


@pytest.mark.asyncio
@pytest.mark.parametrize("return_last_frame", [False, True])
async def test_submit_poll_download_returns_gateway_invocation_id_only(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    return_last_frame: bool,
) -> None:
    generator = _generator(monkeypatch)
    calls: list[tuple[str, str, dict]] = []
    poll_count = 0

    async def request_json(method: str, path: str, **kwargs):
        nonlocal poll_count
        calls.append((method, path, kwargs))
        if method == "POST":
            return {"id": "invocation-1"}, "request-1"
        poll_count += 1
        if poll_count == 1:
            return {"id": "invocation-1", "status": "processing"}, "request-2"
        return {"id": "invocation-1", "status": "completed"}, "request-3"

    async def download_content(task_id: str, output_path: str) -> None:
        assert task_id == "invocation-1"
        Path(output_path).write_bytes(b"video")

    async def no_sleep(_seconds: float) -> None:
        return None

    extracted_frames: list[str] = []

    def extract_last_frame(output_path: str) -> str:
        frame_path = Path(output_path).with_suffix(".png")
        frame_path.write_bytes(b"last-frame")
        extracted_frames.append(str(frame_path))
        return str(frame_path)

    monkeypatch.setattr(generator, "_request_json", request_json)
    monkeypatch.setattr(generator, "_download_content", download_content)
    monkeypatch.setattr(generator, "_extract_last_frame", extract_last_frame)
    monkeypatch.setattr(video_module.asyncio, "sleep", no_sleep)
    output = tmp_path / "result.mp4"

    result = await generator.generate(
        image_path=None,
        prompt="生成视频",
        output_path=str(output),
        poll_interval=0,
        max_polls=2,
        video_config={"return_last_frame": return_last_frame},
    )

    assert result.status is VideoGenStatus.DONE
    assert result.task_id == "invocation-1"
    assert not hasattr(result, "provider_task_id")
    assert output.read_bytes() == b"video"
    if return_last_frame:
        assert result.last_frame_path == str(output.with_suffix(".png"))
        assert Path(result.last_frame_path).read_bytes() == b"last-frame"
        assert extracted_frames == [result.last_frame_path]
    else:
        assert result.last_frame_path is None
        assert extracted_frames == []
    assert [(method, path) for method, path, _kwargs in calls] == [
        ("POST", "videos"),
        ("GET", "videos/invocation-1"),
        ("GET", "videos/invocation-1"),
    ]
    idempotency_key = calls[0][2]["idempotency_key"]
    assert str(uuid.UUID(idempotency_key)) == idempotency_key


@pytest.mark.asyncio
async def test_router_submit_failure_is_not_retried_by_client(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    generator = _generator(monkeypatch)
    submitted_keys: list[str] = []

    async def request_json(method: str, path: str, **kwargs):
        if method == "POST":
            submitted_keys.append(kwargs["idempotency_key"])
            raise CommercialVideoError("router unavailable", status=502)
        raise AssertionError(path)

    monkeypatch.setattr(generator, "_request_json", request_json)
    result = await generator.generate(
        image_path=None,
        prompt="生成视频",
        output_path=str(tmp_path / "recovered.mp4"),
        max_polls=1,
    )

    assert result.status is VideoGenStatus.FAILED
    assert result.error == "router unavailable"
    assert len(submitted_keys) == 1
    assert str(uuid.UUID(submitted_keys[0])) == submitted_keys[0]


@pytest.mark.asyncio
async def test_direct_provider_mode_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    del tmp_path
    with pytest.raises(ValueError, match="mixed"):
        _generator(
            monkeypatch,
            mode="byok",
            base_url="https://models.example/v1",
            api_key="custom-key",
            model="custom-video",
        )


@pytest.mark.asyncio
async def test_timeout_cancels_the_same_gateway_invocation(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    generator = _generator(monkeypatch)
    cancelled: list[str] = []

    async def request_json(method: str, _path: str, **_kwargs):
        if method == "POST":
            return {"id": "invocation-timeout"}, "request-1"
        return {"status": "processing"}, "request-2"

    async def cancel(task_id: str) -> None:
        cancelled.append(task_id)

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(generator, "_request_json", request_json)
    monkeypatch.setattr(generator, "_cancel", cancel)
    monkeypatch.setattr(video_module.asyncio, "sleep", no_sleep)

    result = await generator.generate(
        image_path=None,
        prompt="生成视频",
        output_path=str(tmp_path / "timeout.mp4"),
        poll_interval=0,
        max_polls=1,
    )

    assert result.status is VideoGenStatus.FAILED
    assert result.error == "视频任务轮询超时"
    assert result.task_id == "invocation-timeout"
    assert cancelled == ["invocation-timeout"]


@pytest.mark.asyncio
async def test_timeout_reports_when_remote_cancel_is_not_confirmed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    generator = _generator(monkeypatch)

    async def request_json(method: str, _path: str, **_kwargs):
        if method == "POST":
            return {"id": "invocation-timeout"}, "request-1"
        return {"status": "processing"}, "request-2"

    async def cancel(_task_id: str) -> CommercialVideoError:
        return CommercialVideoError("cancel failed", status=503)

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(generator, "_request_json", request_json)
    monkeypatch.setattr(generator, "_cancel", cancel)
    monkeypatch.setattr(video_module.asyncio, "sleep", no_sleep)

    result = await generator.generate(
        image_path=None,
        prompt="生成视频",
        output_path=str(tmp_path / "timeout.mp4"),
        poll_interval=0,
        max_polls=1,
    )

    assert result.status is VideoGenStatus.FAILED
    assert result.error == "视频任务轮询超时；远端取消未确认"


@pytest.mark.asyncio
async def test_video_download_resumes_existing_partial_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    generator = _generator(monkeypatch)
    output = tmp_path / "result.mp4"
    partial = generator._download_partial_path(output, "invocation-resume")
    partial.write_bytes(b"\x00\x00\x00\x18ftyp")
    requested_headers: list[dict[str, str]] = []

    class _Content:
        async def iter_chunked(self, _size: int):
            yield b"mp42video"

    class _Response:
        status = 206
        headers = {
            "Content-Range": "bytes 8-16/17",
            "Content-Type": "video/mp4",
        }
        content = _Content()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    class _Session:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def get(self, _url: str, *, headers: dict[str, str]):
            requested_headers.append(headers)
            return _Response()

    monkeypatch.setattr(video_module.aiohttp, "ClientSession", _Session)

    await generator._download_content("invocation-resume", str(output))

    assert output.read_bytes() == b"\x00\x00\x00\x18ftypmp42video"
    assert not partial.exists()
    assert requested_headers[0]["Range"] == "bytes=8-"


@pytest.mark.asyncio
async def test_video_download_rejects_html_returned_as_completed_content(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    generator = _generator(monkeypatch)
    output = tmp_path / "result.mp4"
    partial = generator._download_partial_path(output, "invocation-html")

    class _Content:
        async def iter_chunked(self, _size: int):
            yield b"<!doctype html><html><body>gateway frontend</body></html>"

    class _Response:
        status = 200
        headers = {
            "Content-Type": "text/html; charset=utf-8",
            "x-request-id": "request-html",
        }
        content = _Content()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    class _Session:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def get(self, _url: str, *, headers: dict[str, str]):
            return _Response()

    monkeypatch.setattr(video_module.aiohttp, "ClientSession", _Session)

    with pytest.raises(CommercialVideoError, match="非视频内容: text/html") as exc_info:
        await generator._download_content("invocation-html", str(output))

    assert exc_info.value.request_id == "request-html"
    assert not output.exists()
    assert not partial.exists()
