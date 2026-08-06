import base64
import importlib
import logging
from types import SimpleNamespace

import pytest

from ai_anime.modules.model_usage.public import InsufficientCreditsError

pytestmark = pytest.mark.m04


def _isolate_settings_db(monkeypatch, tmp_path):
    import ai_anime.config as config

    state_dir = str(tmp_path / "state")
    monkeypatch.delenv("MODEL_GATEWAY_MODE", raising=False)
    monkeypatch.setenv("AI_ANIME_STATE_DIR", state_dir)
    monkeypatch.setattr(config, "STATE_DIR", state_dir)


@pytest.fixture(autouse=True)
def _isolated_model_gateway(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    from ai_anime.model_access_policy import configure_model_access

    configure_model_access(allows_custom_models=False, mode="cloud")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    # This module tests low-level environment-driven gateway adapters. CE
    # database precedence is covered in test_model_gateway_settings.py.
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "postgresql://test-control-plane")


def _patch_scene_newapi_gateway(
    monkeypatch,
    *,
    api_key: str = "newapi-token",
    base_url: str = "http://newapi.test/v1",
) -> None:
    import ai_anime.config as config

    monkeypatch.setattr(
        config,
        "get_effective_newapi_gateway_config",
        lambda: SimpleNamespace(api_key=api_key, base_url=base_url),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("reference_images", "assigned_role", "requested_role"),
    [
        (None, "IMAGE_EDIT", "IMAGE_GENERATION"),
        ([b"reference"], "IMAGE_GENERATION", "IMAGE_EDIT"),
    ],
)
async def test_image_transport_enforces_byok_role_from_reference_presence(
    reference_images,
    assigned_role: str,
    requested_role: str,
) -> None:
    from ai_anime.modules.generators.nanobanana_grid import _call_newapi_image_api
    from ai_anime.model_access_policy import configure_model_access

    configure_model_access(
        allows_custom_models=True,
        mode="byok",
        byok_base_url="https://models.example.test/v1",
        model_assignments=[
            {"modelId": "local-image", "role": assigned_role},
        ],
    )

    with pytest.raises(PermissionError, match=requested_role):
        await _call_newapi_image_api(
            model="local-image",
            prompt="test",
            reference_images=reference_images,
        )


def test_newapi_sketch_config_uses_explicit_catalog_code(monkeypatch):
    import httpx
    import ai_anime.config as config
    from ai_anime.modules.generators import nanobanana_grid

    posted = {}

    class FakeResponse:
        headers = {"x-newapi-request-id": "req-sketch"}

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

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    config = importlib.reload(config)
    sketch_config = config.get_sketch_generation_config(
        model_override="LingShan-G2"
    )

    assert sketch_config["access_mode"] == "cloud"
    assert sketch_config["model"] == "LingShan-G2"
    assert sketch_config["image_size"] == "1K"
    assert sketch_config["openai_image_quality"] == "low"

    trace = {}
    image_bytes, _text, error = run_async(
        nanobanana_grid._call_newapi_image_api(
            model=sketch_config["model"],
            prompt="sketch prompt",
            image_config={
                "aspect_ratio": "2:3",
                "image_size": sketch_config["image_size"],
                "quality": sketch_config["openai_image_quality"],
            },
            trace=trace,
        )
    )

    assert image_bytes == b"sketch"
    assert error == ""
    assert posted["timeout"] == nanobanana_grid.NEWAPI_IMAGE_HTTP_TIMEOUT_SECONDS == 1800.0
    assert posted["json"]["model"] == "LingShan-G2"
    assert posted["json"]["quality"] == "low"
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "resolution": "1k",
        "quality": "low",
    }
    assert trace == {"request_id": "req-sketch", "response_id": "resp-sketch"}


def test_newapi_sketch_config_can_use_catalog_model_without_quality(monkeypatch):
    import httpx
    import ai_anime.config as config
    from ai_anime.modules.generators import nanobanana_grid

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

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    config = importlib.reload(config)
    sketch_config = config.get_sketch_generation_config(
        model_override="LingShan-NB-2"
    )

    assert sketch_config["access_mode"] == "cloud"
    assert sketch_config["model"] == "LingShan-NB-2"
    assert sketch_config["image_size"] == "1K"

    image_bytes, _text, error = run_async(
        nanobanana_grid._call_newapi_image_api(
            model=sketch_config["model"],
            prompt="sketch prompt",
            image_config={
                "aspect_ratio": "2:3",
                "image_size": sketch_config["image_size"],
                "quality": sketch_config["openai_image_quality"],
            },
        )
    )

    assert image_bytes == b"sketch"
    assert error == ""
    assert posted["json"]["model"] == "LingShan-NB-2"
    assert "quality" not in posted["json"]
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "resolution": "1k",
    }


def test_newapi_image_call_sends_gpt_image2_params(monkeypatch):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

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
        nanobanana_grid._call_newapi_image_api(
            model="LingShan-G2",
            prompt="portrait prompt",
            image_config={
                "aspect_ratio": "3:4",
                "image_size": "0.5K",
                "quality": "medium",
            },
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["url"] == "http://newapi.test/v1/images/generations"
    assert posted["headers"]["Authorization"] == "Bearer newapi-token"
    assert posted["json"]["model"] == "LingShan-G2"
    assert posted["json"]["prompt"] == "portrait prompt"
    assert posted["json"]["quality"] == "medium"
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "3:4",
        "image_size": "1K",
        "resolution": "1k",
        "quality": "medium",
    }


def test_commercial_image_call_supports_keyless_byok(monkeypatch):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

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

    _patch_scene_newapi_gateway(
        monkeypatch,
        api_key="",
        base_url="http://127.0.0.1:11434/v1",
    )
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    image_bytes, _text, error = run_async(
        nanobanana_grid._call_newapi_image_api(
            model="local-image-model",
            prompt="portrait prompt",
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["url"] == "http://127.0.0.1:11434/v1/images/generations"
    assert "Authorization" not in posted["headers"]


def test_newapi_image_call_reports_transport_exception_type(monkeypatch):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

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
        nanobanana_grid._call_newapi_image_api(
            model="LingShan-G2",
            prompt="portrait prompt",
            image_config={"aspect_ratio": "16:9", "image_size": "1K"},
        )
    )

    assert image_bytes is None
    assert "请求异常: ReadTimeout" in error
    assert "endpoint=http://newapi.test/v1" in error
    assert "model=LingShan-G2" in error


def test_newapi_image_call_reraises_insufficient_credit(monkeypatch):
    from ai_anime.modules.generators import nanobanana_grid

    class FakeUsageMeter:
        async def reserve_current_model_call_credit(self, **_kwargs):
            raise InsufficientCreditsError(user_id="usr_1", cost=5, balance=0)

    monkeypatch.setattr(nanobanana_grid, "get_usage_meter", lambda: FakeUsageMeter())

    with pytest.raises(InsufficientCreditsError):
        run_async(
            nanobanana_grid._call_newapi_image_api(
                model="LingShan-G2",
                prompt="portrait prompt",
            )
        )


def test_newapi_sketch_grid_reraises_insufficient_credit(monkeypatch, tmp_path):
    from ai_anime.modules.generators import nanobanana_grid

    async def fake_call_newapi_image_api(**_kwargs):
        raise InsufficientCreditsError(user_id="usr_1", cost=5, balance=0)

    monkeypatch.setattr(
        nanobanana_grid,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
    )

    generator = nanobanana_grid.NanoBananaGridGenerator(
        config={
            "access_mode": "cloud",
            "model": "LingShan-G2",
            "rows": 1,
            "cols": 1,
            "batch_size": 1,
            "total_panels": 1,
            "mode": "1x1",
            "image_size": "1K",
            "openai_sketch_image_quality": "low",
        },
    )

    with pytest.raises(InsufficientCreditsError):
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


def test_newapi_image_call_omits_quality_for_nanobanana2(monkeypatch):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

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

    image_bytes, _text, error = run_async(
        nanobanana_grid._call_newapi_image_api(
            model="LingShan-NB-2",
            prompt="portrait prompt",
            image_config={
                "aspect_ratio": "3:4",
                "image_size": "1K",
                "quality": "medium",
            },
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["json"]["model"] == "LingShan-NB-2"
    assert "quality" not in posted["json"]
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "3:4",
        "image_size": "1K",
        "resolution": "1k",
    }


def test_newapi_image_call_uses_standard_multipart_edits(monkeypatch):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

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
        nanobanana_grid._call_newapi_image_api(
            model="LingShan-G2",
            prompt="identity prompt",
            reference_images=[b"ref-a", b"ref-b"],
            image_config={"aspect_ratio": "3:4", "image_size": "1K", "quality": "medium"},
        )
    )

    assert image_bytes == b"image-bytes"
    assert error == ""
    assert posted["url"] == "http://newapi.test/v1/images/edits"
    assert "Content-Type" not in posted["headers"]
    assert posted["headers"]["Idempotency-Key"]
    assert posted["data"]["model"] == "LingShan-G2"
    assert posted["files"] == [
        ("image", ("reference-1.png", b"ref-a", "image/png")),
        ("image", ("reference-2.png", b"ref-b", "image/png")),
    ]


def test_newapi_image_call_preserves_reference_image_extensions(monkeypatch):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

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
        nanobanana_grid._call_newapi_image_api(
            model="LingShan-G2",
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
    assert posted["url"] == "http://newapi.test/v1/images/edits"
    assert posted["files"] == [
        ("image", ("face.jpg", b"jpg-bytes", "image/jpeg")),
        ("image", ("reference-2.webp", b"webp-bytes", "image/webp")),
    ]


def test_newapi_image_http_error_logs_redacted_request_context(monkeypatch, caplog):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

    posted = {}
    refunds = []

    class FakeResponse:
        status_code = 400
        text = '{"error":{"message":"openai_error","type":"bad_response_status_code"}}'
        headers = {
            "x-newapi-request-id": "req-123",
            "cf-ray": "cf-ray-456",
            "date": "Fri, 22 May 2026 03:00:00 GMT",
            "authorization": "Bearer should-not-leak",
        }

        def raise_for_status(self):
            raise httpx.HTTPStatusError(
                "bad response",
                request=httpx.Request("POST", "http://newapi.test/v1/images/generations"),
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

    class FakeUsageMeter:
        async def reserve_current_model_call_credit(self, **_kwargs):
            return "reservation_1"

        async def refund_model_call_credit_reservation(self, reservation_id, *, metadata=None):
            refunds.append({"reservation_id": reservation_id, "metadata": metadata or {}})

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(nanobanana_grid, "get_usage_meter", lambda: FakeUsageMeter())
    caplog.set_level(logging.WARNING, logger="ai_anime.modules.generators.nanobanana_grid")

    image_bytes, _text, error = run_async(
        nanobanana_grid._call_newapi_image_api(
            model="LingShan-G2",
            prompt="sensitive prompt body",
            reference_images=[b"ref-a"],
            image_config={"aspect_ratio": "2:1", "image_size": "2K", "quality": "medium"},
        )
    )

    log_text = "\n".join(record.getMessage() for record in caplog.records)

    assert image_bytes is None
    assert "request_id=req-123" in error
    assert "cf-ray-456" in error
    assert "model=LingShan-G2" in error
    assert "extra_fields" in error
    assert "reference_image_count=1" in error
    assert "request_id=req-123" in log_text
    assert "http://newapi.test/v1/images/edits" in log_text
    assert "prompt_sha256=" in log_text
    assert "sensitive prompt body" not in error
    assert "sensitive prompt body" not in log_text
    assert "newapi-token" not in error
    assert "newapi-token" not in log_text
    assert "token=secret" not in error
    assert "token=secret" not in log_text
    assert refunds == [
        {
            "reservation_id": "reservation_1",
            "metadata": {
                "source": "newapi_image_api",
                "error": "HTTP 400",
                "request_id": "req-123",
                "http_status": 400,
                "response_headers": {
                    "x-newapi-request-id": "req-123",
                    "cf-ray": "cf-ray-456",
                    "date": "Fri, 22 May 2026 03:00:00 GMT",
                },
            },
        }
    ]


def test_newapi_image_http_5xx_does_not_retry_in_app(monkeypatch):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

    attempts = 0

    class FailingResponse:
        status_code = 502
        text = '{"error":{"message":"error","type":"bad_response"}}'
        headers = {"x-oneapi-request-id": "req-fail"}

        def raise_for_status(self):
            raise httpx.HTTPStatusError(
                "bad gateway",
                request=httpx.Request("POST", "http://newapi.test/v1/images/generations"),
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
        nanobanana_grid._call_newapi_image_api(
            model="LingShan-G2",
            prompt="retry prompt",
            image_config={"aspect_ratio": "2:1", "image_size": "2K", "quality": "medium"},
        )
    )

    assert image_bytes is None
    assert "HTTP 502" in error
    assert "request_id=req-fail" in error
    assert attempts == 1


def test_newapi_image_http_200_error_envelope_is_failure(monkeypatch):
    import httpx
    from ai_anime.modules.generators import nanobanana_grid

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
        nanobanana_grid._call_newapi_image_api(
            model="LingShan-G2",
            prompt="protocol error prompt",
        )
    )

    assert image_bytes is None
    assert "protocol error" in error
    assert "provider rejected image request" in error
    assert "req-protocol-error" in error


def test_newapi_identity_image_sends_portrait_then_costume_references(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.generators import nanobanana_character

    captured = {}

    async def fake_call_newapi_image_api(**kwargs):
        captured.update(kwargs)
        return b"identity-image", "", ""

    monkeypatch.setattr(
        nanobanana_character,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
    )
    generator = nanobanana_character.NanoBananaCharacterGenerator(
        config={
            "access_mode": "cloud",
            "model": "LingShan-NB-2",
        }
    )
    output_path = tmp_path / "identity_body_temp.png"

    image_bytes = run_async(
        generator._generate_with_reference(
            prompt="identity prompt",
            output_path=str(output_path),
            reference_image_bytes=b"portrait-bytes",
            reference_image_name="/project/characters/李雷/reference_portrait.jpg",
            aspect_ratio="16:9",
            image_size="1K",
            additional_image_bytes=[b"costume-bytes"],
            additional_image_names=["/project/characters/李雷/学生_costume.png"],
        )
    )

    assert image_bytes == b"identity-image"
    assert output_path.read_bytes() == b"identity-image"
    assert captured["model"] == "LingShan-NB-2"
    assert "api_key" not in captured
    assert "base_url" not in captured
    assert captured["image_config"] == {
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "quality": "medium",
    }
    assert captured["reference_images"] == [
        ("reference_portrait.jpg", b"portrait-bytes", "image/jpeg"),
        ("学生_costume.png", b"costume-bytes", "image/png"),
    ]


def test_newapi_character_portrait_reraises_insufficient_credit(monkeypatch, tmp_path):
    from ai_anime.modules.generators import nanobanana_character

    async def fake_call_newapi_image_api(**_kwargs):
        raise InsufficientCreditsError(user_id="usr_1", cost=5, balance=0)

    monkeypatch.setattr(
        nanobanana_character,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
    )

    generator = nanobanana_character.NanoBananaCharacterGenerator(
        config={
            "access_mode": "cloud",
            "model": "LingShan-G2",
        }
    )

    with pytest.raises(InsufficientCreditsError):
        run_async(
            generator.generate_character_portrait(
                character_name="李雷",
                character_prompt="young man",
                output_dir=str(tmp_path),
            )
        )


def test_newapi_character_portrait_raise_on_error_preserves_provider_detail(monkeypatch, tmp_path):
    import ai_anime.config as config
    from ai_anime.modules.generators import image_generator, nanobanana_character

    async def fake_call_newapi_image_api(**_kwargs):
        return None, "", "HTTP 504: request_id=req-123; body=provider timeout"

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    importlib.reload(config)
    monkeypatch.setattr(
        nanobanana_character,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
    )
    monkeypatch.setattr(
        nanobanana_character,
        "get_grid_generation_config",
        lambda **_kwargs: {
            "model": "LingShan-G2",
            "openai_image_quality": "medium",
        },
    )

    with pytest.raises(RuntimeError, match="HTTP 504: request_id=req-123"):
        run_async(
            image_generator.generate_character_reference_unified(
                character_name="李雷",
                appearance_prompt="young man",
                output_dir=str(tmp_path),
                count=1,
                model="LingShan-G2",
                raise_on_error=True,
            )
        )


def test_newapi_scene_master_uses_text_only_nanobanana2(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    from ai_anime.modules.generators import scene_reference_images
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_newapi_image_api(**kwargs):
        captured.update(kwargs)
        return b"scene-master", "", ""

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    _patch_scene_newapi_gateway(monkeypatch)
    monkeypatch.setattr(
        scene_reference_images,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
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
            style_name="live_action",
            style_prompt="grounded realism",
            avoid_instructions="no people",
            model="LingShan-NB-2",
        )
    )

    assert output_path == tmp_path / "assets" / "scenes" / "古董店" / "master.png"
    assert output_path.read_bytes() == b"scene-master"
    assert "api_key" not in captured
    assert "base_url" not in captured
    assert captured["model"] == "LingShan-NB-2"
    assert captured["reference_images"] is None
    assert captured["image_config"] == {
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "output_format": "png",
    }
    assert "SCENE NAME: 古董店" in captured["prompt"]
    assert "从店门可以直接看到收银台" in captured["prompt"]


def test_newapi_scene_time_plate_master_injects_time_and_base_reference(monkeypatch, tmp_path):
    from ai_anime.modules.generators import scene_reference_images
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_newapi_image_api(**kwargs):
        captured.update(kwargs)
        return b"scene-night-master", "", ""

    base_master_path = tmp_path / "assets" / "scenes" / "古董店" / "master.png"
    base_master_path.parent.mkdir(parents=True)
    base_master_path.write_bytes(b"base-master-bytes")

    monkeypatch.setattr(
        scene_reference_images,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
    )
    _patch_scene_newapi_gateway(monkeypatch)

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
            model="LingShan-NB-2",
        )
    )

    assert output_path == tmp_path / "assets" / "scenes" / "古董店_夜晚" / "master.png"
    assert output_path.read_bytes() == b"scene-night-master"
    assert captured["reference_images"] == [
        ("base_scene_master_master.png", b"base-master-bytes", "image/png")
    ]
    assert "TARGET TIME-OF-DAY PLATE: 夜晚" in captured["prompt"]
    assert "overall lighting must read as 夜晚" in captured["prompt"]
    assert "Keep the same architecture" in captured["prompt"]


def test_newapi_scene_variant_plate_master_keeps_described_lighting(monkeypatch, tmp_path):
    from ai_anime.modules.generators import scene_reference_images
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_newapi_image_api(**kwargs):
        captured.update(kwargs)
        return b"scene-variant-master", "", ""

    base_master_path = tmp_path / "assets" / "scenes" / "城市街道" / "master.png"
    base_master_path.parent.mkdir(parents=True)
    base_master_path.write_bytes(b"base-master-bytes")

    monkeypatch.setattr(
        scene_reference_images,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
    )
    _patch_scene_newapi_gateway(monkeypatch)

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
            model="LingShan-NB-2",
        )
    )

    assert output_path == tmp_path / "assets" / "scenes" / "城市街道_雨夜版" / "master.png"
    assert captured["reference_images"] == [
        ("base_scene_master_master.png", b"base-master-bytes", "image/png")
    ]
    assert "STRUCTURED VARIANT PLATE" in captured["prompt"]
    assert "variant_id=雨夜版" in captured["prompt"]
    assert "do NOT neutralize" in captured["prompt"]
    # The base-scene neutralizer must not fire for variant plates.
    assert "IGNORE mood/time-of-day phrases" not in captured["prompt"]


def test_newapi_reverse_master_uses_master_reference_nanobanana2(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    from ai_anime.modules.generators import scene_reference_images
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_newapi_image_api(**kwargs):
        captured.update(kwargs)
        return b"scene-reverse", "", ""

    master_path = tmp_path / "assets" / "scenes" / "古董店" / "master.png"
    master_path.parent.mkdir(parents=True)
    master_path.write_bytes(b"master-bytes")

    monkeypatch.setattr(
        scene_reference_images,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
    )
    _patch_scene_newapi_gateway(monkeypatch)

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
            style_name="live_action",
            style_prompt="grounded realism",
            avoid_instructions="no people",
            model="LingShan-NB-2",
        )
    )

    assert output_path == tmp_path / "assets" / "scenes" / "古董店" / "reverse_master.png"
    assert output_path.read_bytes() == b"scene-reverse"
    assert "api_key" not in captured
    assert "base_url" not in captured
    assert captured["model"] == "LingShan-NB-2"
    assert captured["reference_images"] == [
        ("scene_master_master.png", b"master-bytes", "image/png")
    ]
    assert captured["image_config"] == {
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "output_format": "png",
    }
    assert "REFERENCE 1 = the scene's FRONT-FACING master" in captured["prompt"]


def test_newapi_reverse_master_can_use_gpt_image2_quality_low(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    from ai_anime.modules.generators import scene_reference_images
    from ai_anime.modules.asset_world.public import NovelScene

    captured = {}

    async def fake_call_newapi_image_api(**kwargs):
        captured.update(kwargs)
        return b"scene-reverse", "", ""

    master_path = tmp_path / "assets" / "scenes" / "古董店" / "master.png"
    master_path.parent.mkdir(parents=True)
    master_path.write_bytes(b"master-bytes")

    monkeypatch.setattr(
        scene_reference_images,
        "_call_newapi_image_api",
        fake_call_newapi_image_api,
    )
    _patch_scene_newapi_gateway(monkeypatch)

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
            model="LingShan-G2",
        )
    )

    assert captured["model"] == "LingShan-G2"
    assert captured["reference_images"] == [
        ("scene_master_master.png", b"master-bytes", "image/png")
    ]
    assert captured["image_config"] == {
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "output_format": "png",
        "quality": "low",
    }


def test_newapi_prop_reference_gpt_image2_sends_quality_medium(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    import httpx
    import ai_anime.config as config
    from ai_anime.modules.generators import nanobanana_prop

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
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    importlib.reload(config)
    nanobanana_prop = importlib.reload(nanobanana_prop)
    monkeypatch.setattr(
        nanobanana_prop,
        "get_grid_generation_config",
        lambda **_kwargs: {
            "model": "LingShan-G2",
            "openai_image_quality": "medium",
        },
    )

    output_path = tmp_path / "assets" / "props" / "玉佩" / "reference_3view.png"
    result = run_async(
        nanobanana_prop.generate_prop_reference(
            visual_prompt="青绿色玉佩，边缘有金色纹路",
            output_path=str(output_path),
            model="LingShan-G2",
        )
    )

    assert result == str(output_path)
    assert output_path.read_bytes() == b"prop-ref"
    assert posted["url"] == "http://newapi.test/v1/images/generations"
    assert posted["headers"]["Authorization"] == "Bearer newapi-token"
    assert posted["json"]["model"] == "LingShan-G2"
    assert posted["json"]["quality"] == "medium"
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "resolution": "1k",
        "quality": "medium",
    }


def test_newapi_prop_reference_nanobanana2_omits_quality(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    import httpx
    import ai_anime.config as config
    from ai_anime.modules.generators import nanobanana_prop

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
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    importlib.reload(config)
    nanobanana_prop = importlib.reload(nanobanana_prop)
    monkeypatch.setattr(
        nanobanana_prop,
        "get_grid_generation_config",
        lambda **_kwargs: {
            "model": "LingShan-NB-2",
            "openai_image_quality": "medium",
        },
    )

    output_path = tmp_path / "assets" / "props" / "玉佩" / "reference_3view.png"
    result = run_async(
        nanobanana_prop.generate_prop_reference(
            visual_prompt="青绿色玉佩，边缘有金色纹路",
            output_path=str(output_path),
            model="LingShan-NB-2",
        )
    )

    assert result == str(output_path)
    assert output_path.read_bytes() == b"prop-ref"
    assert posted["json"]["model"] == "LingShan-NB-2"
    assert "quality" not in posted["json"]
    assert posted["json"]["extra_fields"] == {
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "resolution": "1k",
    }


def test_newapi_prop_reference_reraises_insufficient_credit(monkeypatch, tmp_path):
    _isolate_settings_db(monkeypatch, tmp_path)
    import ai_anime.config as config
    from ai_anime.modules.generators import nanobanana_prop

    async def fake_call_newapi_image_api(**_kwargs):
        raise InsufficientCreditsError(user_id="usr_1", cost=5, balance=0)

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    importlib.reload(config)
    nanobanana_prop = importlib.reload(nanobanana_prop)
    monkeypatch.setattr(nanobanana_prop, "_call_newapi_image_api", fake_call_newapi_image_api)
    monkeypatch.setattr(
        nanobanana_prop,
        "get_grid_generation_config",
        lambda **_kwargs: {
            "model": "LingShan-G2",
            "openai_image_quality": "medium",
        },
    )

    with pytest.raises(InsufficientCreditsError):
        run_async(
            nanobanana_prop.generate_prop_reference(
                visual_prompt="青绿色玉佩，边缘有金色纹路",
                output_path=str(tmp_path / "reference_3view.png"),
                model="LingShan-G2",
            )
        )


def test_freezone_single_image_generation_routes_newapi(monkeypatch, tmp_path):
    from ai_anime.modules.generators import nanobanana_grid

    captured = {}

    async def fake_call_newapi_image_api(**kwargs):
        captured.update(kwargs)
        return b"freezone-image", "", ""

    monkeypatch.setattr(nanobanana_grid, "_call_newapi_image_api", fake_call_newapi_image_api)

    output_path = tmp_path / "freezone.png"
    image_path = run_async(
        nanobanana_grid.generate_text_to_image(
            prompt="freezone prompt",
            output_path=str(output_path),
            aspect_ratio="1:1",
            image_size="2K",
            quality="medium",
            config={
                "provider": "commercial",
                "model": "LingShan-G2",
                "openai_image_quality": "medium",
                "openai_sketch_image_quality": "low",
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
    assert captured["model"] == "LingShan-G2"
    assert captured["prompt"] == "freezone prompt"
    assert captured["reference_images"] is None
    assert "base_url" not in captured
    assert captured["image_config"] == {
        "aspect_ratio": "1:1",
        "image_size": "2K",
        "quality": "medium",
    }


def run_async(coro):
    import asyncio

    return asyncio.run(coro)
