import base64
import importlib
import logging
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.model_usage.public import (
    ModelQuotaExceededError,
    configure_model_access,
)

pytestmark = pytest.mark.m04

QUALITY_IMAGE_MODEL = "image-model-with-quality"
BASIC_IMAGE_MODEL = "image-model-basic"
CATALOG_IMAGE_MODEL = "QWEN_IMAGE_2512"


def _configure_image_generation_route(model: str) -> None:
    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {"modelId": model, "role": "IMAGE_GENERATION", "priority": 1},
        ],
    )


def _isolate_settings_db(monkeypatch, tmp_path):
    state_dir = str(tmp_path / "state")
    monkeypatch.delenv("MODEL_GATEWAY_MODE", raising=False)
    monkeypatch.setenv("AI_ANIME_STATE_DIR", state_dir)


@pytest.fixture(autouse=True)
def _isolated_model_gateway(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    from ai_anime.modules.model_usage.public import configure_model_access

    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {"modelId": QUALITY_IMAGE_MODEL, "role": "IMAGE_GENERATION"},
            {"modelId": QUALITY_IMAGE_MODEL, "role": "IMAGE_EDIT"},
            {"modelId": BASIC_IMAGE_MODEL, "role": "IMAGE_GENERATION"},
            {"modelId": BASIC_IMAGE_MODEL, "role": "IMAGE_EDIT"},
            {"modelId": "local-image-model", "role": "IMAGE_GENERATION"},
        ],
        model_capabilities=[
            {
                "modelId": QUALITY_IMAGE_MODEL,
                "extraParameterNames": ["quality", "negative_prompt"],
            },
            {"modelId": BASIC_IMAGE_MODEL},
        ],
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "gateway-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://gateway.test/v1")
    # This module tests low-level environment-driven gateway adapters. CE
    # database precedence is covered in test_model_gateway_settings.py.
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "postgresql://test-control-plane")


def _patch_scene_model_gateway_gateway(
    monkeypatch,
    *,
    api_key: str = "gateway-token",
    base_url: str = "http://gateway.test/v1",
) -> None:
    import ai_anime.modules.model_usage.infrastructure.model_runtime as model_runtime

    monkeypatch.setattr(
        model_runtime,
        "get_effective_model_gateway_transport_config",
        lambda: SimpleNamespace(api_key=api_key, base_url=base_url),
    )


def _patch_scene_style_preset(monkeypatch, scene_reference_images) -> None:
    monkeypatch.setattr(
        scene_reference_images,
        "get_style_preset",
        lambda *_args, **_kwargs: {
            "label": "全局风格",
            "style_instructions": "统一画面语言",
            "avoid_instructions": "避免风格漂移",
        },
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("reference_images", "assigned_role", "requested_role"),
    [
        (None, "IMAGE_EDIT", "IMAGE_GENERATION"),
        ([b"reference"], "IMAGE_GENERATION", "IMAGE_EDIT"),
    ],
)
async def test_image_transport_enforces_router_role_from_reference_presence(
    reference_images,
    assigned_role: str,
    requested_role: str,
) -> None:
    from ai_anime.modules.production.infrastructure.media_generation.image_grid import (
        _call_image_generation_api,
    )
    from ai_anime.modules.model_usage.public import configure_model_access

    configure_model_access(
        allows_custom_models=True,
        mode="mixed",
        model_assignments=[
            {"modelId": "local-image", "role": assigned_role},
        ],
    )

    with pytest.raises(PermissionError, match=requested_role):
        await _call_image_generation_api(
            prompt="test",
            reference_images=reference_images,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("aspect_ratio", "expected_size"),
    [
        ("1:1", "1328x1328"),
        ("16:9", "1664x928"),
        ("9:16", "928x1664"),
        ("4:3", "1472x1140"),
        ("3:4", "1140x1472"),
        ("3:2", "1584x1056"),
        ("2:3", "1056x1584"),
    ],
)
async def test_catalog_image_request_uses_declared_exact_size(
    monkeypatch,
    aspect_ratio: str,
    expected_size: str,
) -> None:
    import httpx

    from ai_anime.modules.production.infrastructure.media_generation.image_grid import (
        _call_image_generation_api,
    )

    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {
                "modelId": CATALOG_IMAGE_MODEL,
                "role": "IMAGE_GENERATION",
                "priority": 1,
            },
        ],
        model_capabilities=[
            {
                "modelId": CATALOG_IMAGE_MODEL,
                "imageRatioOptions": [
                    "1:1",
                    "16:9",
                    "9:16",
                    "4:3",
                    "3:4",
                    "3:2",
                    "2:3",
                ],
                "imageSizeOptions": [
                    "1328x1328",
                    "1664x928",
                    "928x1664",
                    "1472x1140",
                    "1140x1472",
                    "1584x1056",
                    "1056x1584",
                ],
            },
        ],
    )
    posted = {}

    class FakeResponse:
        headers = {}

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"image").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            posted.update(json)
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = await _call_image_generation_api(
        prompt="catalog size",
        image_config={
            "model": CATALOG_IMAGE_MODEL,
            "model_selector": f"cloud:{CATALOG_IMAGE_MODEL}",
            "aspect_ratio": aspect_ratio,
            "image_size": "1K",
        },
    )

    assert image_bytes == b"image"
    assert error == ""
    assert posted["size"] == expected_size


@pytest.mark.asyncio
async def test_catalog_image_request_rejects_undeclared_aspect_before_post(
    monkeypatch,
) -> None:
    import httpx

    from ai_anime.modules.production.infrastructure.media_generation.image_grid import (
        _call_image_generation_api,
    )

    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {
                "modelId": CATALOG_IMAGE_MODEL,
                "role": "IMAGE_GENERATION",
                "priority": 1,
            },
        ],
        model_capabilities=[
            {
                "modelId": CATALOG_IMAGE_MODEL,
                "imageRatioOptions": ["1:1"],
                "imageSizeOptions": ["1328x1328"],
            },
        ],
    )
    posted = False

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, *args, **kwargs):
            nonlocal posted
            posted = True
            raise AssertionError("unsupported aspect must not reach the gateway")

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = await _call_image_generation_api(
        prompt="unsupported aspect",
        image_config={
            "model": CATALOG_IMAGE_MODEL,
            "aspect_ratio": "21:9",
            "image_size": "1K",
        },
    )

    assert image_bytes is None
    assert "不支持图片画幅 21:9" in error
    assert posted is False


def test_model_gateway_sketch_config_uses_explicit_catalog_code(monkeypatch):
    import httpx
    import ai_anime.modules.production.infrastructure.media_generation_settings as config
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    posted = {}

    class FakeResponse:
        headers = {"x-request-id": "req-sketch"}

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "id": "resp-sketch",
                "data": [{"b64_json": base64.b64encode(b"sketch").decode()}],
            }

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            posted["timeout"] = kwargs.get("timeout")

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            posted["json"] = json
            return FakeResponse()

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "gateway-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://gateway.test/v1")
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    config = importlib.reload(config)
    sketch_config = config.get_sketch_generation_config(
        model_override=QUALITY_IMAGE_MODEL
    )

    assert sketch_config["access_mode"] == "mixed"
    assert sketch_config["model"] == QUALITY_IMAGE_MODEL
    assert sketch_config["image_size"] == "1K"
    assert sketch_config["image_quality"] == "low"

    trace = {}
    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="sketch prompt",
            image_config={
                "aspect_ratio": "2:3",
                "image_size": sketch_config["image_size"],
                "quality": sketch_config["image_quality"],
            },
            trace=trace,
        )
    )

    assert image_bytes == b"sketch"
    assert error == ""
    assert posted["timeout"].connect == image_grid.IMAGE_GATEWAY_CONNECT_TIMEOUT_SECONDS
    assert posted["timeout"].read == image_grid.IMAGE_GATEWAY_READ_TIMEOUT_SECONDS
    assert posted["timeout"].write == image_grid.IMAGE_GATEWAY_WRITE_TIMEOUT_SECONDS
    assert posted["timeout"].pool == image_grid.IMAGE_GATEWAY_POOL_TIMEOUT_SECONDS
    assert posted["json"]["model"] == QUALITY_IMAGE_MODEL
    assert posted["json"]["quality"] == "low"
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "resolution": "1k",
        "quality": "low",
    }
    assert trace == {"request_id": "req-sketch", "response_id": "resp-sketch"}


def test_model_gateway_sketch_config_can_use_catalog_model_without_quality(monkeypatch):
    import httpx
    import ai_anime.modules.production.infrastructure.media_generation_settings as config
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    posted = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"sketch").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            posted["json"] = json
            return FakeResponse()

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "gateway-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://gateway.test/v1")
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    _configure_image_generation_route(BASIC_IMAGE_MODEL)

    config = importlib.reload(config)
    sketch_config = config.get_sketch_generation_config(
        model_override=BASIC_IMAGE_MODEL
    )

    assert sketch_config["access_mode"] == "mixed"
    assert sketch_config["model"] == BASIC_IMAGE_MODEL
    assert sketch_config["image_size"] == "1K"

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="sketch prompt",
            image_config={
                "aspect_ratio": "2:3",
                "image_size": sketch_config["image_size"],
                "quality": sketch_config["image_quality"],
            },
        )
    )

    assert image_bytes == b"sketch"
    assert error == ""
    assert posted["json"]["model"] == BASIC_IMAGE_MODEL
    assert "quality" not in posted["json"]
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "resolution": "1k",
    }


def test_model_gateway_image_call_sends_declared_quality_parameter(monkeypatch):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    posted = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"image-bytes").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            posted["url"] = url
            posted["headers"] = headers
            posted["json"] = json
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="portrait prompt",
            image_config={
                "aspect_ratio": "3:4",
                "image_size": "0.5K",
                "quality": "medium",
                "negative_prompt": "photorealism, 3D CGI",
            },
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["url"] == "http://gateway.test/v1/images/generations"
    assert posted["headers"]["Authorization"] == "Bearer gateway-token"
    assert posted["json"]["model"] == QUALITY_IMAGE_MODEL
    assert posted["json"]["prompt"] == "portrait prompt"
    assert posted["json"]["quality"] == "medium"
    assert posted["json"]["negative_prompt"] == "photorealism, 3D CGI"
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "3:4",
        "image_size": "1K",
        "resolution": "1k",
        "quality": "medium",
    }


def test_commercial_image_call_supports_keyless_byok(monkeypatch):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    posted = {}

    class FakeResponse:
        headers = {}

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"image-bytes").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            posted["url"] = url
            posted["headers"] = headers
            return FakeResponse()

    _patch_scene_model_gateway_gateway(
        monkeypatch,
        api_key="",
        base_url="http://127.0.0.1:11434/v1",
    )
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="portrait prompt",
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["url"] == "http://127.0.0.1:11434/v1/images/generations"
    assert "Authorization" not in posted["headers"]


def test_model_gateway_image_call_reports_transport_exception_type(monkeypatch):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            raise httpx.ReadTimeout("")

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="portrait prompt",
            image_config={"aspect_ratio": "16:9", "image_size": "1K"},
        )
    )

    assert image_bytes is None
    assert "请求异常: ReadTimeout" in error
    assert "endpoint=http://gateway.test/v1" in error
    assert f"model={QUALITY_IMAGE_MODEL}" in error


def test_model_gateway_image_call_enforces_absolute_timeout(monkeypatch):
    import asyncio
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            await asyncio.Event().wait()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(image_grid, "IMAGE_GATEWAY_TOTAL_TIMEOUT_SECONDS", 0.01)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="portrait prompt",
            image_config={"aspect_ratio": "16:9", "image_size": "1K"},
        )
    )

    assert image_bytes is None
    assert "请求超时" in error
    assert "已中止" in error


def test_image_grid_reraises_remote_quota_rejection(monkeypatch, tmp_path):
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    async def fake_call_image_generation_api(**_kwargs):
        raise ModelQuotaExceededError(
            user_id="usr_1", required_units=5, available_units=0
        )

    monkeypatch.setattr(
        image_grid,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )

    generator = image_grid.ImageGridGenerator(
        config={
            "access_mode": "mixed",
            "model": QUALITY_IMAGE_MODEL,
            "rows": 1,
            "cols": 1,
            "batch_size": 1,
            "total_panels": 1,
            "mode": "1x1",
            "image_size": "1K",
            "sketch_image_quality": "low",
        },
    )

    with pytest.raises(ModelQuotaExceededError):
        run_async(
            generator.generate_grid(
                beats=[
                    {
                        "beat_number": 3,
                        "visual_description": "女主站在竹林中回头。",
                        "narration": "她终于察觉身后有人。",
                    }
                ],
                character_map={},
                style="chinese_period_drama",
                output_path=str(tmp_path / "sketch.png"),
                rows=1,
                cols=1,
                sketch=True,
                mode_key="1x1_2-3_sketch",
                location_beat_numbers=[3],
            )
        )


def test_model_gateway_image_call_omits_undeclared_quality_parameter(monkeypatch):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    posted = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"image-bytes").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            posted["json"] = json
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    _configure_image_generation_route(BASIC_IMAGE_MODEL)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="portrait prompt",
            image_config={
                "aspect_ratio": "3:4",
                "image_size": "1K",
                "quality": "medium",
                "negative_prompt": "photorealism, 3D CGI",
            },
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["json"]["model"] == BASIC_IMAGE_MODEL
    assert "quality" not in posted["json"]
    assert "negative_prompt" not in posted["json"]
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "3:4",
        "image_size": "1K",
        "resolution": "1k",
    }


def test_model_gateway_image_call_uses_standard_multipart_edits(monkeypatch):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    posted = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"image-bytes").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, data, files):
            posted.update(url=url, headers=headers, data=data, files=files)
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="identity prompt",
            reference_images=[b"ref-a", b"ref-b"],
            image_config={
                "aspect_ratio": "3:4",
                "image_size": "1K",
                "quality": "medium",
                "negative_prompt": "photorealism",
            },
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["url"] == "http://gateway.test/v1/images/edits"
    assert "Content-Type" not in posted["headers"]
    assert posted["headers"]["Idempotency-Key"]
    assert posted["data"]["model"] == QUALITY_IMAGE_MODEL
    assert posted["data"]["negative_prompt"] == "photorealism"
    assert posted["files"] == [
        ("image", ("reference-1.png", b"ref-a", "image/png")),
        ("image", ("reference-2.png", b"ref-b", "image/png")),
    ]


def test_model_gateway_image_call_preserves_reference_image_extensions(monkeypatch):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    posted = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"image-bytes").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, data, files):
            posted.update(url=url, headers=headers, data=data, files=files)
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="identity prompt",
            reference_images=[
                ("face.jpg", b"jpg-bytes", "image/jpeg"),
                (b"webp-bytes", "image/webp"),
            ],
            image_config={"aspect_ratio": "3:4", "image_size": "1K", "quality": "medium"},
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["url"] == "http://gateway.test/v1/images/edits"
    assert posted["files"] == [
        ("image", ("face.jpg", b"jpg-bytes", "image/jpeg")),
        ("image", ("reference-2.webp", b"webp-bytes", "image/webp")),
    ]


def test_model_gateway_image_http_error_logs_redacted_request_context(monkeypatch, caplog):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    posted = {}
    class FakeResponse:
        status_code = 400
        text = '{"error":{"message":"provider_error","type":"bad_response_status_code"}}'
        headers = {
            "x-request-id": "req-123",
            "cf-ray": "cf-ray-456",
            "date": "Fri, 22 May 2026 03:00:00 GMT",
            "authorization": "Bearer should-not-leak",
        }

        def raise_for_status(self):
            raise httpx.HTTPStatusError(
                "bad response",
                request=httpx.Request("POST", "http://gateway.test/v1/images/generations"),
                response=self,
            )

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, data, files):
            posted["url"] = url
            posted["headers"] = headers
            posted["data"] = data
            posted["files"] = files
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    caplog.set_level(
        logging.WARNING,
        logger=(
            "ai_anime.modules.production.infrastructure.media_generation."
            "image_grid"
        ),
    )

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="sensitive prompt body",
            reference_images=[b"ref-a"],
            image_config={"aspect_ratio": "2:1", "image_size": "2K", "quality": "medium"},
        )
    )

    log_text = "\n".join(record.getMessage() for record in caplog.records)

    assert image_bytes is None
    assert "request_id=req-123" in error
    assert "cf-ray-456" in error
    assert f"model={QUALITY_IMAGE_MODEL}" in error
    assert "extra_fields" in error
    assert "reference_image_count=1" in error
    assert "request_id=req-123" in log_text
    assert "http://gateway.test/v1/images/edits" in log_text
    assert "prompt_sha256=" in log_text
    assert "sensitive prompt body" not in error
    assert "sensitive prompt body" not in log_text
    assert "gateway-token" not in error
    assert "gateway-token" not in log_text
    assert "token=secret" not in error
    assert "token=secret" not in log_text


def test_model_gateway_image_http_5xx_relies_on_unified_router_retry(monkeypatch):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    attempts = 0

    class FailingResponse:
        status_code = 502
        text = '{"error":{"message":"error","type":"bad_response"}}'
        headers = {"x-request-id": "req-fail"}

        def raise_for_status(self):
            raise httpx.HTTPStatusError(
                "bad gateway",
                request=httpx.Request("POST", "http://gateway.test/v1/images/generations"),
                response=self,
            )

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            nonlocal attempts
            attempts += 1
            return FailingResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="retry prompt",
            image_config={"aspect_ratio": "2:1", "image_size": "2K", "quality": "medium"},
        )
    )

    assert image_bytes is None
    assert "HTTP 502" in error
    assert "云端图片生成服务暂时不可用" in error
    assert "请求编号：req-fail" in error
    assert "http://gateway.test" not in error
    assert "bad_response" not in error
    assert attempts == 1


def test_model_gateway_image_http_200_error_envelope_is_failure(monkeypatch):
    import httpx
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    class ErrorResponse:
        headers = {"x-request-id": "req-protocol-error"}

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "error": {
                    "code": "provider_failed",
                    "message": "provider rejected image request",
                }
            }

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            return ErrorResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = run_async(
        image_grid._call_image_generation_api(
            prompt="protocol error prompt",
        )
    )

    assert image_bytes is None
    assert "protocol error" in error
    assert "provider rejected image request" in error
    assert "req-protocol-error" in error


def test_model_gateway_character_image_preserves_reference_order(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.production.infrastructure.media_generation import (
        character_image_generator,
    )

    captured = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"identity-image", "", ""

    monkeypatch.setattr(
        character_image_generator,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    generator = character_image_generator.CharacterImageGenerator(
        config={
            "access_mode": "mixed",
            "model": BASIC_IMAGE_MODEL,
            "model_selector": f"cloud:{BASIC_IMAGE_MODEL}",
        }
    )
    output_path = tmp_path / "identity_body_temp.png"

    image_bytes = run_async(
        generator._generate_single_image(
            prompt="identity prompt",
            output_path=str(output_path),
            aspect_ratio="16:9",
            image_size="1K",
            reference_images=[
                ("reference_portrait.jpg", b"portrait-bytes", "image/jpeg"),
                ("学生_costume.png", b"costume-bytes", "image/png"),
            ],
        )
    )

    assert image_bytes == b"identity-image"
    assert output_path.read_bytes() == b"identity-image"
    assert "model" not in captured
    assert "api_key" not in captured
    assert "base_url" not in captured
    assert captured["image_config"] == {
        "model": BASIC_IMAGE_MODEL,
        "model_selector": f"cloud:{BASIC_IMAGE_MODEL}",
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "quality": "medium",
        "negative_prompt": "",
    }
    assert captured["reference_images"] == [
        ("reference_portrait.jpg", b"portrait-bytes", "image/jpeg"),
        ("学生_costume.png", b"costume-bytes", "image/png"),
    ]


def test_character_portrait_uses_text_only_style_contract(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.production.infrastructure.media_generation import (
        character_image_generator,
    )

    captured = {}
    style_reference = tmp_path / "style-face.png"
    style_reference.write_bytes(
        base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
    )

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"portrait", "", ""

    monkeypatch.setattr(
        character_image_generator,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    monkeypatch.setattr(
        character_image_generator,
        "get_style_preset",
        lambda *_args, **_kwargs: {
            "style_instructions": "soft anime linework",
            "avoid_instructions": "photorealism",
            "style_reference_image_path": str(style_reference),
        },
    )
    generator = character_image_generator.CharacterImageGenerator(
        config={"access_mode": "mixed", "model": BASIC_IMAGE_MODEL}
    )

    result = run_async(
        generator.generate_character_portrait(
            character_name="林晚晴",
            character_prompt="round face, short brown hair",
            output_dir=str(tmp_path / "character"),
        )
    )

    assert result.success is True
    assert captured["reference_images"] is None
    assert "soft anime linework" in captured["prompt"]
    assert "photorealism" in captured["prompt"]
    assert captured["image_config"]["negative_prompt"] == "photorealism"
    assert "GLOBAL STYLE CONTRACT (TEXT-ONLY RENDERING GRAMMAR)" in captured["prompt"]
    assert "GLOBAL STYLE REFERENCE IMAGE" not in captured["prompt"]
    assert "Keep different named characters visibly distinct" in captured["prompt"]


def test_identity_sheet_keeps_character_and_costume_references_without_style_preview(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.production.infrastructure.media_generation import (
        character_image_generator,
    )

    captured = {}
    style_reference = tmp_path / "style-face.png"
    portrait_reference = tmp_path / "character-portrait.png"
    costume_reference = tmp_path / "costume.png"
    style_reference.write_bytes(b"style-face")
    portrait_reference.write_bytes(b"character-face")
    costume_reference.write_bytes(b"costume")

    async def fake_generate_single_image(**kwargs):
        captured.update(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"identity-sheet")
        return b"identity-sheet"

    monkeypatch.setattr(
        character_image_generator.CharacterImageGenerator,
        "_generate_single_image",
        staticmethod(fake_generate_single_image),
    )
    monkeypatch.setattr(
        character_image_generator,
        "get_style_preset",
        lambda *_args, **_kwargs: {
            "style_instructions": "soft anime linework",
            "avoid_instructions": "photorealism",
            "style_reference_image_path": str(style_reference),
        },
    )
    generator = character_image_generator.CharacterImageGenerator(
        config={"access_mode": "mixed", "model": BASIC_IMAGE_MODEL}
    )
    output_path = (
        tmp_path
        / "output"
        / "owner"
        / "project"
        / "assets"
        / "characters"
        / "林晚晴"
        / "identities"
        / "学生.png"
    )
    output_path.parent.mkdir(parents=True)

    result = run_async(
        generator.generate_identity_with_reference(
            character_name="林晚晴",
            identity_prompt="short brown hair, school uniform",
            reference_image_path=str(portrait_reference),
            costume_image_path=str(costume_reference),
            output_path=str(output_path),
        )
    )

    assert result.success is True
    assert captured["reference_images"] == [
        ("character-portrait.png", b"character-face", "image/png"),
        ("costume.png", b"costume", "image/png"),
    ]
    assert captured["negative_prompt"] == "photorealism"
    assert "soft anime linework" in captured["prompt"]
    assert "GLOBAL STYLE CONTRACT (TEXT-ONLY RENDERING GRAMMAR)" in captured["prompt"]
    assert "GLOBAL STYLE REFERENCE IMAGE" not in captured["prompt"]


def test_model_gateway_character_portrait_reraises_insufficient_credit(monkeypatch, tmp_path):
    from ai_anime.modules.production.infrastructure.media_generation import (
        character_image_generator,
    )

    async def fake_call_image_generation_api(**_kwargs):
        raise ModelQuotaExceededError(
            user_id="usr_1", required_units=5, available_units=0
        )

    monkeypatch.setattr(
        character_image_generator,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )

    generator = character_image_generator.CharacterImageGenerator(
        config={
            "access_mode": "mixed",
            "model": QUALITY_IMAGE_MODEL,
        }
    )

    with pytest.raises(ModelQuotaExceededError):
        run_async(
            generator.generate_character_portrait(
                character_name="李雷",
                character_prompt="young man",
                output_dir=str(tmp_path),
            )
        )


def test_model_gateway_character_portrait_raise_on_error_preserves_provider_detail(monkeypatch, tmp_path):
    import ai_anime.modules.production.infrastructure.media_generation_settings as config
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_generator,
        character_image_generator,
    )

    async def fake_call_image_generation_api(**_kwargs):
        return None, "", "HTTP 504: request_id=req-123; body=provider timeout"

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "gateway-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://gateway.test/v1")
    importlib.reload(config)
    monkeypatch.setattr(
        character_image_generator,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    monkeypatch.setattr(
        character_image_generator,
        "get_grid_generation_config",
        lambda **_kwargs: {
            "model": QUALITY_IMAGE_MODEL,
            "image_quality": "medium",
        },
    )

    with pytest.raises(RuntimeError, match="HTTP 504: request_id=req-123"):
        run_async(
            image_generator.generate_character_reference_unified(
                character_name="李雷",
                appearance_prompt="young man",
                output_dir=str(tmp_path),
                count=1,
                model=QUALITY_IMAGE_MODEL,
                raise_on_error=True,
            )
        )


def test_model_gateway_scene_master_uses_text_only_global_style(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    from ai_anime.modules.production.infrastructure.media_generation import (
        scene_reference_images,
    )
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"scene-master", "", ""

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "gateway-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://gateway.test/v1")
    _patch_scene_model_gateway_gateway(monkeypatch)
    monkeypatch.setattr(
        scene_reference_images,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    style_reference = tmp_path / "style.png"
    style_reference.write_bytes(b"style-image")
    monkeypatch.setattr(
        scene_reference_images,
        "get_style_preset",
        lambda *_args, **_kwargs: {
            "label": "全局风格",
            "style_instructions": "统一画面语言",
            "avoid_instructions": "避免风格漂移",
            "style_reference_image_path": str(style_reference),
        },
    )

    scene = NovelScene(
        name="古董店",
        scene_type="interior",
        environment_prompt="从店门可以直接看到收银台，周围堆放着一些古董",
    )

    output_path = run_async(
        scene_reference_images.generate_scene_reference_image(
            project_dir=tmp_path,
            scene=scene,
            kind="master",
            style_id="custom_global",
            model=BASIC_IMAGE_MODEL,
        )
    )

    assert output_path == tmp_path / "assets" / "scenes" / "古董店" / "master.png"
    assert output_path.read_bytes() == b"scene-master"
    assert "api_key" not in captured
    assert "base_url" not in captured
    assert "model" not in captured
    assert captured["reference_images"] is None
    assert "统一画面语言" in captured["prompt"]
    assert "避免风格漂移" in captured["prompt"]
    assert "GLOBAL STYLE CONTRACT (TEXT-ONLY RENDERING GRAMMAR)" in captured["prompt"]
    assert "GLOBAL STYLE REFERENCE IMAGE" not in captured["prompt"]
    assert captured["image_config"] == {
        "model": BASIC_IMAGE_MODEL,
        "model_selector": "",
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "output_format": "png",
        "negative_prompt": "避免风格漂移",
    }
    assert "SCENE NAME: 古董店" in captured["prompt"]
    assert "从店门可以直接看到收银台" in captured["prompt"]


def test_model_gateway_scene_time_plate_master_injects_time_and_base_reference(monkeypatch, tmp_path):
    from ai_anime.modules.production.infrastructure.media_generation import (
        scene_reference_images,
    )
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"scene-night-master", "", ""

    base_master_path = tmp_path / "assets" / "scenes" / "古董店" / "master.png"
    base_master_path.parent.mkdir(parents=True)
    base_master_path.write_bytes(b"base-master-bytes")

    monkeypatch.setattr(
        scene_reference_images,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    _patch_scene_model_gateway_gateway(monkeypatch)
    _patch_scene_style_preset(monkeypatch, scene_reference_images)

    scene = NovelScene(
        name="古董店_夜晚",
        base_scene_id="古董店",
        time_of_day="夜晚",
        scene_type="interior",
        environment_prompt="正面：收银台与古董柜\n光源：中性基础光",
    )

    output_path = run_async(
        scene_reference_images.generate_scene_reference_image(
            project_dir=tmp_path,
            scene=scene,
            kind="master",
            model=BASIC_IMAGE_MODEL,
        )
    )

    assert output_path == tmp_path / "assets" / "scenes" / "古董店_夜晚" / "master.png"
    assert output_path.read_bytes() == b"scene-night-master"
    assert captured["reference_images"] == [
        ("base_scene_master_master.png", b"base-master-bytes", "image/png"),
    ]
    assert "TARGET TIME-OF-DAY PLATE: 夜晚" in captured["prompt"]
    assert "overall lighting must read as 夜晚" in captured["prompt"]
    assert "Keep the same architecture" in captured["prompt"]


def test_model_gateway_scene_variant_plate_master_keeps_described_lighting(monkeypatch, tmp_path):
    from ai_anime.modules.production.infrastructure.media_generation import (
        scene_reference_images,
    )
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"scene-variant-master", "", ""

    base_master_path = tmp_path / "assets" / "scenes" / "城市街道" / "master.png"
    base_master_path.parent.mkdir(parents=True)
    base_master_path.write_bytes(b"base-master-bytes")

    monkeypatch.setattr(
        scene_reference_images,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    _patch_scene_model_gateway_gateway(monkeypatch)
    _patch_scene_style_preset(monkeypatch, scene_reference_images)

    scene = NovelScene(
        name="城市街道_雨夜版",
        base_scene_id="城市街道",
        variant_id="雨夜版",
        scene_type="exterior",
        environment_prompt="正面：湿漉沥青马路\n光源：路灯昏暗，积水反光，雨夜氛围",
    )

    output_path = run_async(
        scene_reference_images.generate_scene_reference_image(
            project_dir=tmp_path,
            scene=scene,
            kind="master",
            model=BASIC_IMAGE_MODEL,
        )
    )

    assert output_path == tmp_path / "assets" / "scenes" / "城市街道_雨夜版" / "master.png"
    assert captured["reference_images"] == [
        ("base_scene_master_master.png", b"base-master-bytes", "image/png"),
    ]
    assert "STRUCTURED VARIANT PLATE" in captured["prompt"]
    assert "variant_id=雨夜版" in captured["prompt"]
    assert "do NOT neutralize" in captured["prompt"]
    # The base-scene neutralizer must not fire for variant plates.
    assert "IGNORE mood/time-of-day phrases" not in captured["prompt"]


def test_reverse_master_uses_master_reference_with_basic_image_model(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    from ai_anime.modules.production.infrastructure.media_generation import (
        scene_reference_images,
    )
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"scene-reverse", "", ""

    master_path = tmp_path / "assets" / "scenes" / "古董店" / "master.png"
    master_path.parent.mkdir(parents=True)
    master_path.write_bytes(b"master-bytes")

    monkeypatch.setattr(
        scene_reference_images,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    _patch_scene_model_gateway_gateway(monkeypatch)
    _patch_scene_style_preset(monkeypatch, scene_reference_images)

    scene = NovelScene(
        name="古董店",
        scene_type="interior",
        environment_prompt="从店门可以直接看到收银台，周围堆放着一些古董",
    )

    output_path = run_async(
        scene_reference_images.generate_scene_reference_image(
            project_dir=tmp_path,
            scene=scene,
            kind="reverse_master",
            style_id="custom_global",
            model=BASIC_IMAGE_MODEL,
        )
    )

    assert output_path == tmp_path / "assets" / "scenes" / "古董店" / "reverse_master.png"
    assert output_path.read_bytes() == b"scene-reverse"
    assert "api_key" not in captured
    assert "base_url" not in captured
    assert "model" not in captured
    assert captured["reference_images"] == [
        ("scene_master_master.png", b"master-bytes", "image/png"),
    ]
    assert captured["image_config"] == {
        "model": BASIC_IMAGE_MODEL,
        "model_selector": "",
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "output_format": "png",
        "negative_prompt": "避免风格漂移",
    }
    assert "REFERENCE 1 = the scene's FRONT-FACING master" in captured["prompt"]


def test_reverse_master_sends_catalog_declared_quality(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    from ai_anime.modules.production.infrastructure.media_generation import (
        scene_reference_images,
    )
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"scene-reverse", "", ""

    master_path = tmp_path / "assets" / "scenes" / "古董店" / "master.png"
    master_path.parent.mkdir(parents=True)
    master_path.write_bytes(b"master-bytes")

    monkeypatch.setattr(
        scene_reference_images,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    _patch_scene_model_gateway_gateway(monkeypatch)
    _patch_scene_style_preset(monkeypatch, scene_reference_images)

    scene = NovelScene(
        name="古董店",
        scene_type="interior",
        environment_prompt="从店门可以直接看到收银台，周围堆放着一些古董",
    )

    run_async(
        scene_reference_images.generate_scene_reference_image(
            project_dir=tmp_path,
            scene=scene,
            kind="reverse_master",
            model=QUALITY_IMAGE_MODEL,
        )
    )

    assert "model" not in captured
    assert captured["reference_images"] == [
        ("scene_master_master.png", b"master-bytes", "image/png"),
    ]
    assert captured["image_config"] == {
        "model": QUALITY_IMAGE_MODEL,
        "model_selector": "",
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "output_format": "png",
        "negative_prompt": "避免风格漂移",
        "quality": "medium",
    }


def test_prop_reference_sends_catalog_declared_quality(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    import httpx
    import ai_anime.modules.production.infrastructure.media_generation_settings as config
    from ai_anime.modules.production.infrastructure.media_generation import (
        prop_image_generator,
    )

    posted = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"prop-ref").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            posted["url"] = url
            posted["headers"] = headers
            posted["json"] = json
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "gateway-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://gateway.test/v1")
    importlib.reload(config)
    prop_image_generator = importlib.reload(prop_image_generator)
    monkeypatch.setattr(
        prop_image_generator,
        "get_style_preset",
        lambda *_args, **_kwargs: {
            "style_instructions": "product style",
            "avoid_instructions": "watermark",
        },
    )
    monkeypatch.setattr(
        prop_image_generator,
        "get_grid_generation_config",
        lambda **_kwargs: {
            "model": QUALITY_IMAGE_MODEL,
            "image_quality": "medium",
        },
    )

    output_path = tmp_path / "assets" / "props" / "玉佩" / "reference_3view.png"
    result = run_async(
        prop_image_generator.generate_prop_reference(
            visual_prompt="青绿色玉佩，边缘有金色纹路",
            output_path=str(output_path),
            model=QUALITY_IMAGE_MODEL,
        )
    )

    assert result == str(output_path)
    assert output_path.read_bytes() == b"prop-ref"
    assert posted["url"] == "http://gateway.test/v1/images/generations"
    assert posted["headers"]["Authorization"] == "Bearer gateway-token"
    assert posted["json"]["model"] == QUALITY_IMAGE_MODEL
    assert posted["json"]["quality"] == "medium"
    assert posted["json"]["negative_prompt"] == "watermark"
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "resolution": "1k",
        "quality": "medium",
    }


def test_prop_reference_omits_undeclared_quality(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    import httpx
    import ai_anime.modules.production.infrastructure.media_generation_settings as config
    from ai_anime.modules.production.infrastructure.media_generation import (
        prop_image_generator,
    )

    posted = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"prop-ref").decode()}]}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            posted["json"] = json
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    _configure_image_generation_route(BASIC_IMAGE_MODEL)
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "gateway-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://gateway.test/v1")
    importlib.reload(config)
    prop_image_generator = importlib.reload(prop_image_generator)
    monkeypatch.setattr(
        prop_image_generator,
        "get_style_preset",
        lambda *_args, **_kwargs: {
            "style_instructions": "product style",
            "avoid_instructions": "watermark",
        },
    )
    monkeypatch.setattr(
        prop_image_generator,
        "get_grid_generation_config",
        lambda **_kwargs: {
            "model": BASIC_IMAGE_MODEL,
            "image_quality": "medium",
        },
    )

    output_path = tmp_path / "assets" / "props" / "玉佩" / "reference_3view.png"
    result = run_async(
        prop_image_generator.generate_prop_reference(
            visual_prompt="青绿色玉佩，边缘有金色纹路",
            output_path=str(output_path),
            model=BASIC_IMAGE_MODEL,
        )
    )

    assert result == str(output_path)
    assert output_path.read_bytes() == b"prop-ref"
    assert posted["json"]["model"] == BASIC_IMAGE_MODEL
    assert "quality" not in posted["json"]
    assert "negative_prompt" not in posted["json"]
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "resolution": "1k",
    }


def test_model_gateway_prop_reference_reraises_insufficient_credit(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    import ai_anime.modules.production.infrastructure.media_generation_settings as config
    from ai_anime.modules.production.infrastructure.media_generation import (
        prop_image_generator,
    )

    async def fake_call_image_generation_api(**_kwargs):
        raise ModelQuotaExceededError(
            user_id="usr_1", required_units=5, available_units=0
        )

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "gateway-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://gateway.test/v1")
    importlib.reload(config)
    prop_image_generator = importlib.reload(prop_image_generator)
    monkeypatch.setattr(prop_image_generator, "_call_image_generation_api", fake_call_image_generation_api)
    monkeypatch.setattr(
        prop_image_generator,
        "get_grid_generation_config",
        lambda **_kwargs: {
            "model": QUALITY_IMAGE_MODEL,
            "image_quality": "medium",
        },
    )

    with pytest.raises(ModelQuotaExceededError):
        run_async(
            prop_image_generator.generate_prop_reference(
                visual_prompt="青绿色玉佩，边缘有金色纹路",
                output_path=str(tmp_path / "reference_3view.png"),
                model=QUALITY_IMAGE_MODEL,
            )
        )


def test_freezone_single_image_generation_routes_model_gateway(monkeypatch, tmp_path):
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    captured = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"freezone-image", "", ""

    monkeypatch.setattr(image_grid, "_call_image_generation_api", fake_call_image_generation_api)

    output_path = tmp_path / "freezone.png"
    image_path = run_async(
        image_grid.generate_text_to_image(
            prompt="freezone prompt",
            output_path=str(output_path),
            aspect_ratio="1:1",
            image_size="2K",
            quality="medium",
            config={
                "provider": "commercial",
                "model": QUALITY_IMAGE_MODEL,
                "image_quality": "medium",
                "sketch_image_quality": "low",
                "image_size": "2K",
                "mode": "1x1",
                "rows": 1,
                "cols": 1,
                "total_panels": 1,
            },
        )
    )

    assert image_path == output_path
    assert output_path.read_bytes() == b"freezone-image"
    assert "api_key" not in captured
    assert "model" not in captured
    assert captured["prompt"] == "freezone prompt"
    assert captured["reference_images"] is None
    assert "base_url" not in captured
    assert captured["image_config"] == {
        "model": QUALITY_IMAGE_MODEL,
        "model_selector": "",
        "model_params": {},
        "aspect_ratio": "1:1",
        "image_size": "2K",
        "quality": "medium",
        "negative_prompt": "",
    }


def test_freezone_image_generation_applies_text_only_project_style(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.production.infrastructure.media_generation import (
        image_grid,
    )

    style_reference = tmp_path / "style.png"
    style_reference.write_bytes(b"style-image")
    monkeypatch.setattr(
        image_grid,
        "get_project_style_preset",
        lambda *_args, **_kwargs: (
            "custom_global",
            {
                "style_instructions": "GLOBAL STYLE TEXT",
                "avoid_instructions": "GLOBAL STYLE AVOID",
                "style_reference_image_path": str(style_reference),
            },
        ),
    )
    captured = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"styled-image", "", ""

    monkeypatch.setattr(
        image_grid,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )
    output_path = tmp_path / "project" / "freezone.png"

    run_async(
        image_grid.generate_text_to_image(
            prompt="freezone prompt",
            output_path=str(output_path),
            project_dir=tmp_path / "project",
            config={
                "model": QUALITY_IMAGE_MODEL,
                "rows": 1,
                "cols": 1,
                "total_panels": 1,
            },
        )
    )

    assert "PROJECT VISUAL STYLE:\nGLOBAL STYLE TEXT" in captured["prompt"]
    assert "AVOID:\nGLOBAL STYLE AVOID" in captured["prompt"]
    assert "GLOBAL STYLE CONTRACT (TEXT-ONLY RENDERING GRAMMAR)" in captured["prompt"]
    assert "GLOBAL STYLE REFERENCE IMAGE" not in captured["prompt"]
    assert captured["reference_images"] is None


def run_async(coro):
    import asyncio

    return asyncio.run(coro)
