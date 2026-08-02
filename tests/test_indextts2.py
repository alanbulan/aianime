import pytest

from ai_anime.modules.model_usage.public import InsufficientCreditsError

pytestmark = pytest.mark.m07


@pytest.fixture(autouse=True)
def _configured_model_access(monkeypatch):
    from ai_anime.model_access_policy import configure_model_access

    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "newapi-test-key")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "http://newapi.test/v1")
    configure_model_access(allows_custom_models=False, mode="cloud")
    yield
    configure_model_access(allows_custom_models=False, mode="cloud")


class _FakeResponse:
    def __init__(self, payload=None, content=b"audio-bytes", headers=None):
        self._payload = payload or {}
        self.content = content
        self.headers = headers or {"content-type": "application/json"}

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeAsyncClient:
    calls = []
    post_response = _FakeResponse({"audio": {"url": "https://example.com/generated.mp3"}})
    get_response = _FakeResponse(content=b"generated-mp3")

    def __init__(self, *args, **kwargs):
        self.kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, *, headers=None, json=None):
        self.calls.append(("post", url, headers, json))
        return self.post_response

    async def get(self, url):
        self.calls.append(("get", url, None, None))
        return self.get_response


@pytest.mark.asyncio
async def test_reserve_tts_model_call_uses_audio_billing_kind(monkeypatch):
    import ai_anime.generators.indextts2 as indextts2

    calls: list[dict] = []

    class FakeUsageMeter:
        async def reserve_current_model_call_credit(self, **kwargs):
            calls.append(kwargs)
            return "reservation_1"

    monkeypatch.setattr(indextts2, "get_usage_meter", lambda: FakeUsageMeter())

    reservation_id = await indextts2._reserve_tts_model_call(
        "index-tts-2",
        source="indextts2_commercial",
    )

    assert reservation_id == "reservation_1"
    assert calls == [
        {
            "model": "index-tts-2",
            "billing_kind": "audio",
            "metadata": {"source": "indextts2_commercial"},
        }
    ]


@pytest.mark.asyncio
async def test_indextts2_commercial_posts_audio_speech_schema(monkeypatch, tmp_path):
    import httpx
    import ai_anime.generators.indextts2 as indextts2

    from ai_anime.generators.indextts2 import IndexTTS2Client

    _FakeAsyncClient.calls = []
    reserved: list[dict] = []
    confirmed: list[dict] = []
    refunded: list[dict] = []
    _FakeAsyncClient.post_response = _FakeResponse(
        content=b"generated-wav",
        headers={"content-type": "audio/wav", "x-oneapi-request-id": "req_tts_1"},
    )

    async def fake_reserve(model, *, source):
        reserved.append({"model": model, "source": source})
        return "reservation_1"

    async def fake_confirm(**kwargs):
        confirmed.append(kwargs)

    async def fake_refund(reservation_id, *, source, error, provider_request_id=""):
        refunded.append(
            {
                "reservation_id": reservation_id,
                "source": source,
                "error": error,
                "provider_request_id": provider_request_id,
            }
        )

    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(indextts2, "_reserve_tts_model_call", fake_reserve)
    monkeypatch.setattr(indextts2, "_confirm_tts_model_call", fake_confirm)
    monkeypatch.setattr(indextts2, "_refund_tts_model_call", fake_refund)

    output_path = tmp_path / "beat_03.mp3"
    client = IndexTTS2Client(
        model="index-tts-2",
        timeout_seconds=12,
    )
    result = await client.generate(
        prompt="你终于来了。",
        audio_url="data:audio/wav;base64,abc",
        output_path=output_path,
        emotion_prompt="压低声音，克制但急切",
    )

    assert result.success is True
    assert output_path.read_bytes() == b"generated-wav"
    assert reserved == [{"model": "index-tts-2", "source": "indextts2_commercial"}]
    assert confirmed == [
        {
            "model": "index-tts-2",
            "reservation_id": "reservation_1",
            "provider_request_id": "req_tts_1",
            "response_id": "",
        }
    ]
    assert refunded == []
    assert _FakeAsyncClient.calls == [
        (
            "post",
            "http://newapi.test/v1/audio/speech",
            {
                "Authorization": "Bearer newapi-test-key",
                "Content-Type": "application/json",
            },
                {
                    "model": "index-tts-2",
                    "input": "你终于来了。",
                    "response_format": "mp3",
                    "metadata": {
                    "audio_url": "data:audio/wav;base64,abc",
                    "should_use_prompt_for_emotion": True,
                    "emotion_prompt": "压低声音，克制但急切",
                },
            },
        )
    ]


@pytest.mark.asyncio
async def test_indextts2_refunds_reserved_credit_on_generation_failure(monkeypatch, tmp_path):
    import httpx
    import ai_anime.generators.indextts2 as indextts2

    from ai_anime.generators.indextts2 import IndexTTS2Client

    _FakeAsyncClient.calls = []
    refunded: list[dict] = []
    _FakeAsyncClient.post_response = _FakeResponse(
        {"id": "resp_tts_1"},
        headers={"content-type": "application/json", "x-oneapi-request-id": "req_tts_1"},
    )

    async def fake_reserve(model, *, source):
        return "reservation_1"

    async def fake_confirm(**kwargs):
        raise AssertionError("confirm should not be called")

    async def fake_refund(reservation_id, *, source, error, provider_request_id=""):
        refunded.append(
            {
                "reservation_id": reservation_id,
                "source": source,
                "error": error,
                "provider_request_id": provider_request_id,
            }
        )

    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(indextts2, "_reserve_tts_model_call", fake_reserve)
    monkeypatch.setattr(indextts2, "_confirm_tts_model_call", fake_confirm)
    monkeypatch.setattr(indextts2, "_refund_tts_model_call", fake_refund)

    client = IndexTTS2Client(
        model="index-tts-2",
        timeout_seconds=12,
    )
    result = await client.generate(
        prompt="测试",
        audio_url="data:audio/wav;base64,abc",
        output_path=tmp_path / "beat_03.mp3",
    )

    assert result.success is False
    assert refunded == [
        {
            "reservation_id": "reservation_1",
            "source": "indextts2_commercial",
            "error": "ModelAudioTransportError: model audio response missing audio bytes or URL",
            "provider_request_id": "req_tts_1",
        }
    ]


@pytest.mark.asyncio
async def test_indextts2_reraises_insufficient_credit(monkeypatch, tmp_path):
    import ai_anime.generators.indextts2 as indextts2

    from ai_anime.generators.indextts2 import IndexTTS2Client

    async def fake_reserve(model, *, source):
        raise InsufficientCreditsError(user_id="usr_1", cost=3, balance=0)

    monkeypatch.setattr(indextts2, "_reserve_tts_model_call", fake_reserve)

    client = IndexTTS2Client(
        model="index-tts-2",
        timeout_seconds=12,
    )

    with pytest.raises(InsufficientCreditsError):
        await client.generate(
            prompt="测试",
            audio_url="data:audio/wav;base64,abc",
            output_path=tmp_path / "beat_03.mp3",
        )


@pytest.mark.asyncio
async def test_indextts2_supports_keyless_byok(monkeypatch, tmp_path):
    import httpx
    import ai_anime.generators.indextts2 as indextts2

    from ai_anime.generators.indextts2 import IndexTTS2Client
    from ai_anime.model_access_policy import configure_model_access

    async def fake_reserve(model, *, source):
        return "reservation_1"

    async def fake_confirm(**kwargs):
        return None

    configure_model_access(
        allows_custom_models=True,
        mode="byok",
        byok_base_url="http://127.0.0.1:11434/v1",
        byok_api_key="",
        model_assignments=[
            {"modelId": "local-index-tts", "role": "AUDIO_VOICE_CLONE"},
        ],
    )
    _FakeAsyncClient.calls = []
    _FakeAsyncClient.post_response = _FakeResponse(
        content=b"generated-wav",
        headers={"content-type": "audio/wav"},
    )
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(indextts2, "_reserve_tts_model_call", fake_reserve)
    monkeypatch.setattr(indextts2, "_confirm_tts_model_call", fake_confirm)

    result = await IndexTTS2Client(model="local-index-tts").generate(
        prompt="测试",
        audio_url="https://example.com/reference.wav",
        output_path=tmp_path / "out.mp3",
    )

    assert result.success is True
    assert _FakeAsyncClient.calls[0][1] == "http://127.0.0.1:11434/v1/audio/speech"
    assert "Authorization" not in _FakeAsyncClient.calls[0][2]
