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
        "get_effective_newapi_gateway_config",
        lambda: SimpleNamespace(
            mode=mode,
            base_url=base_url,
            api_key=api_key,
        ),
    )
    return CommercialVideoGenerator(model_role=model_role)


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
            "seedance2_config": {
                "resolution": "720p",
                "scene_optimize": "anime",
                "return_last_frame": True,
            }
        },
    )

    assert payload == {
        "model": "cloud-video-standard",
        "prompt": "角色缓慢转身，镜头向前推进",
        "seconds": "5",
        "size": "1280x720",
        "scene_optimize": "anime",
        "return_last_frame": True,
    }
    assert media == []
    assert return_last_frame is True


def test_seedance_request_clamps_short_duration_before_gateway_submission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = "video-seeddance-4wlmqpxwma4r65j3"
    generator = _generator(
        monkeypatch,
        model=model,
        model_role="VIDEO_IMAGE_TO_VIDEO",
        model_capabilities=[
            {
                "modelId": model,
                "videoProfile": "seedance2",
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
        kwargs={"seedance2_config": {"duration": 1, "resolution": "720p"}},
    )

    assert payload["seconds"] == "4"


def test_video_request_rejects_duration_above_catalog_maximum(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = "video-seeddance-4wlmqpxwma4r65j3"
    generator = _generator(
        monkeypatch,
        model=model,
        model_role="VIDEO_IMAGE_TO_VIDEO",
        model_capabilities=[
            {
                "modelId": model,
                "videoProfile": "seedance2",
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
            kwargs={"seedance2_config": {"duration": 15}},
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
        kwargs={"seedance2_config": {"resolution": "1080p"}},
    )

    assert payload["size"] == "1080x1920"
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
            kwargs={"seedance2_config": options},
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
async def test_submit_poll_download_returns_gateway_invocation_id_only(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
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

    monkeypatch.setattr(generator, "_request_json", request_json)
    monkeypatch.setattr(generator, "_download_content", download_content)
    monkeypatch.setattr(video_module.asyncio, "sleep", no_sleep)
    output = tmp_path / "result.mp4"

    result = await generator.generate(
        image_path=None,
        prompt="生成视频",
        output_path=str(output),
        poll_interval=0,
        max_polls=2,
    )

    assert result.status is VideoGenStatus.DONE
    assert result.task_id == "invocation-1"
    assert not hasattr(result, "provider_task_id")
    assert output.read_bytes() == b"video"
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
