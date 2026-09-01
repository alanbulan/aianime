def test_identity_planner_uses_the_canonical_text_model_factory(monkeypatch):
    from ai_anime.modules.narrative_planning.infrastructure.identity_planner_agent import IdentityPlanner
    import ai_anime.modules.narrative_planning.infrastructure.identity_planner_agent as identity_planner

    calls = []
    sentinel = object()

    def fake_model_gateway_model():
        calls.append(None)
        return sentinel

    monkeypatch.setattr(
        identity_planner,
        "get_text_pydantic_model",
        fake_model_gateway_model,
    )

    assert IdentityPlanner._identity_model() is sentinel
    assert calls == [None]


def test_model_gateway_text_model_settings_use_path_specific_thinking(monkeypatch):
    from ai_anime.modules.narrative_planning.infrastructure.identity_planner_agent import IdentityPlanner

    monkeypatch.setenv("IDENTITY_PLANNER_CAST_THINKING_LEVEL", "low")
    monkeypatch.setenv("IDENTITY_PLANNER_ANALYSIS_THINKING_LEVEL", "high")

    assert IdentityPlanner._identity_model_settings(
        "IDENTITY_PLANNER_CAST_THINKING_LEVEL",
        "high",
    ) == {"openai_reasoning_effort": "low"}

    assert IdentityPlanner._identity_model_settings(
        "IDENTITY_PLANNER_ANALYSIS_THINKING_LEVEL",
        "low",
    ) == {"openai_reasoning_effort": "high"}


def test_model_gateway_text_model_settings_empty_env_disables(monkeypatch):
    from ai_anime.modules.narrative_planning.infrastructure.identity_planner_agent import IdentityPlanner

    monkeypatch.setenv("IDENTITY_PLANNER_APPEARANCE_THINKING_LEVEL", "")

    assert (
        IdentityPlanner._identity_model_settings(
            "IDENTITY_PLANNER_APPEARANCE_THINKING_LEVEL",
            "high",
        )
        is None
    )


def test_model_gateway_text_provider_default_trusts_env(monkeypatch):
    import asyncio

    import ai_anime.modules.model_usage.infrastructure.model_runtime as config

    monkeypatch.delenv("MODEL_TEXT_TRUST_ENV", raising=False)

    provider = config._model_gateway_text_openai_provider(
        api_key="key",
        base_url="https://example.test/v1",
        timeout_seconds=12.0,
    )
    http_client = provider._own_http_client
    try:
        assert http_client is not None
        assert http_client.trust_env is True
        assert provider._http_client_factory is not None
    finally:
        if http_client is not None:
            asyncio.run(http_client.aclose())


def test_model_gateway_text_provider_can_disable_system_proxy(monkeypatch):
    import asyncio

    import ai_anime.modules.model_usage.infrastructure.model_runtime as config

    monkeypatch.setenv("MODEL_TEXT_TRUST_ENV", "false")

    provider = config._model_gateway_text_openai_provider(
        api_key="key",
        base_url="https://example.test/v1",
        timeout_seconds=12.0,
    )
    http_client = provider._own_http_client
    try:
        assert http_client is not None
        assert http_client.trust_env is False
    finally:
        if http_client is not None:
            asyncio.run(http_client.aclose())


def test_model_gateway_profile_keeps_thinking_and_uses_auto_for_structured_output():
    import asyncio

    from pydantic_ai.models import ModelRequestParameters
    from pydantic_ai.tools import ToolDefinition

    import ai_anime.modules.model_usage.infrastructure.model_runtime as config

    model = config._model_gateway_text_openai_model(
        "qwen3.8-flash",
        api_key="key",
        base_url="https://example.test/v1",
        timeout_seconds=12.0,
        profile=config._model_gateway_text_profile(),
    )
    http_client = model.provider._own_http_client
    settings = {"openai_reasoning_effort": "low"}
    try:
        _, tool_choice = model._get_tool_choice(
            settings,
            ModelRequestParameters(
                output_tools=[
                    ToolDefinition(
                        name="final_result",
                        parameters_json_schema={
                            "type": "object",
                            "properties": {"value": {"type": "string"}},
                            "required": ["value"],
                        },
                        kind="output",
                    )
                ],
                allow_text_output=False,
            ),
        )
    finally:
        asyncio.run(http_client.aclose())

    assert settings == {"openai_reasoning_effort": "low"}
    assert tool_choice == "auto"


def test_model_gateway_text_model_closes_owned_http_client_after_request(monkeypatch):
    import asyncio
    import uuid

    from pydantic_ai.models.openai import OpenAIChatModel

    import ai_anime.modules.model_usage.infrastructure.model_runtime as config

    model = config._model_gateway_text_openai_model(
        "gpt-test",
        api_key="key",
        base_url="https://example.test/v1",
        timeout_seconds=12.0,
        profile=None,
    )
    provider = model.provider
    http_client = provider._own_http_client
    assert http_client is not None
    assert not http_client.is_closed

    original_request = OpenAIChatModel.request
    request_keys = []

    async def fake_request(self, *args, **kwargs):
        assert not self.provider._own_http_client.is_closed
        request_keys.append(config._TEXT_MODEL_IDEMPOTENCY_KEY.get())
        return "ok"

    monkeypatch.setattr(OpenAIChatModel, "request", fake_request)

    try:
        result = asyncio.run(model.request([], None, None))
    finally:
        monkeypatch.setattr(OpenAIChatModel, "request", original_request)
        if not http_client.is_closed:
            asyncio.run(http_client.aclose())

    assert result == "ok"
    assert str(uuid.UUID(request_keys[0])) == request_keys[0]
    assert config._TEXT_MODEL_IDEMPOTENCY_KEY.get() == ""
    assert http_client.is_closed


def test_model_gateway_text_http_retries_reuse_the_operation_idempotency_key():
    import asyncio

    import httpx

    import ai_anime.modules.model_usage.infrastructure.model_runtime as config

    client = config._model_gateway_text_http_client_factory(
        timeout_seconds=12.0,
        omit_authorization=True,
    )()

    async def run_hooks() -> tuple[httpx.Request, httpx.Request, httpx.Request]:
        token = config._TEXT_MODEL_IDEMPOTENCY_KEY.set("operation-1")
        try:
            first = httpx.Request(
                "POST",
                "https://example.test/v1/chat/completions",
                headers={"Authorization": "Bearer ai-anime-no-auth"},
            )
            retry = httpx.Request(
                "POST",
                "https://example.test/v1/chat/completions",
                headers={"Authorization": "Bearer ai-anime-no-auth"},
            )
            read = httpx.Request("GET", "https://example.test/v1/models")
            for request in (first, retry, read):
                for hook in client._event_hooks["request"]:
                    await hook(request)
            return first, retry, read
        finally:
            config._TEXT_MODEL_IDEMPOTENCY_KEY.reset(token)
            await client.aclose()

    first, retry, read = asyncio.run(run_hooks())

    assert first.headers["Idempotency-Key"] == "operation-1"
    assert retry.headers["Idempotency-Key"] == "operation-1"
    assert "Authorization" not in first.headers
    assert "Idempotency-Key" not in read.headers
    assert first.headers["X-AI-Anime-Model-Role"] == "TEXT"
    assert retry.headers["X-AI-Anime-Model-Role"] == "TEXT"
    assert read.headers["X-AI-Anime-Model-Role"] == "TEXT"
    assert config._TEXT_MODEL_IDEMPOTENCY_KEY.get() == ""


def test_model_gateway_text_stream_keeps_one_key_until_the_stream_closes(monkeypatch):
    import asyncio
    import uuid
    from contextlib import asynccontextmanager

    from pydantic_ai.models.openai import OpenAIChatModel

    import ai_anime.modules.model_usage.infrastructure.model_runtime as config

    model = config._model_gateway_text_openai_model(
        "gpt-test",
        api_key="key",
        base_url="https://example.test/v1",
        timeout_seconds=12.0,
        profile=None,
    )
    provider = model.provider
    http_client = provider._own_http_client
    stream_keys = []

    @asynccontextmanager
    async def fake_request_stream(self, *args, **kwargs):
        stream_keys.append(config._TEXT_MODEL_IDEMPOTENCY_KEY.get())
        yield "stream"
        stream_keys.append(config._TEXT_MODEL_IDEMPOTENCY_KEY.get())

    monkeypatch.setattr(OpenAIChatModel, "request_stream", fake_request_stream)

    async def consume() -> None:
        async with model.request_stream([], None, None) as response:
            assert response == "stream"
            stream_keys.append(config._TEXT_MODEL_IDEMPOTENCY_KEY.get())

    try:
        asyncio.run(consume())
    finally:
        if not http_client.is_closed:
            asyncio.run(http_client.aclose())

    assert len(set(stream_keys)) == 1
    assert str(uuid.UUID(stream_keys[0])) == stream_keys[0]
    assert config._TEXT_MODEL_IDEMPOTENCY_KEY.get() == ""
    assert http_client.is_closed


def test_asset_compiler_scene_planner_uses_scene_model_gateway_env(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    import ai_anime.modules.narrative_planning.infrastructure.asset_compiler_agent as asset_compiler

    model_calls = []
    settings_calls = []
    agent_kwargs = {}

    def fake_model_gateway_model():
        model_calls.append(None)
        return "scene-model"

    def fake_settings(thinking_env, default_thinking_level):
        settings_calls.append((thinking_env, default_thinking_level))
        return {"openai_reasoning_effort": default_thinking_level}

    class FakeAgent:
        def __init__(self, model, **kwargs):
            agent_kwargs["model"] = model
            agent_kwargs.update(kwargs)

        async def run(self, task):
            return SimpleNamespace(output=SimpleNamespace(derived_scenes=[]))

    monkeypatch.setattr(
        asset_compiler, "get_text_pydantic_model", fake_model_gateway_model
    )
    monkeypatch.setattr(
        asset_compiler,
        "get_text_pydantic_model_settings",
        fake_settings,
    )
    monkeypatch.setattr(asset_compiler, "Agent", FakeAgent)

    compiler = asset_compiler.AssetCompiler(cognee_store=None)
    block = SimpleNamespace(
        header_line="古董店 内 日", lines=["△ 古董堆满房间", "李雷环顾四周", "灯光昏暗"]
    )

    result = asyncio.run(compiler._analyze_derived_scenes("古董店", block))

    assert result == []
    assert model_calls == [None]
    assert settings_calls == [("EPISODE_SCENE_PLANNER_THINKING_LEVEL", "low")]
    assert agent_kwargs["model"] == "scene-model"
    assert agent_kwargs["name"] == "派生场景分析师"


def test_asset_compiler_prop_planner_uses_prop_model_gateway_env(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    import ai_anime.modules.narrative_planning.infrastructure.asset_compiler_agent as asset_compiler

    model_calls = []
    settings_calls = []
    agent_kwargs = {}

    def fake_model_gateway_model():
        model_calls.append(None)
        return "prop-model"

    def fake_settings(thinking_env, default_thinking_level):
        settings_calls.append((thinking_env, default_thinking_level))
        return {"openai_reasoning_effort": default_thinking_level}

    class FakeAgent:
        def __init__(self, model, **kwargs):
            agent_kwargs["model"] = model
            agent_kwargs.update(kwargs)

        async def run(self, task):
            return SimpleNamespace(output=SimpleNamespace(requirements=[]))

    monkeypatch.setattr(
        asset_compiler, "get_text_pydantic_model", fake_model_gateway_model
    )
    monkeypatch.setattr(
        asset_compiler,
        "get_text_pydantic_model_settings",
        fake_settings,
    )
    monkeypatch.setattr(asset_compiler, "Agent", FakeAgent)

    compiler = asset_compiler.AssetCompiler(cognee_store=None)
    block = SimpleNamespace(
        header_line="古董店 内 日", lines=["李雷拿起龙符咒", "龙符咒发出红光"]
    )

    result = asyncio.run(
        compiler._analyze_block_props(
            block,
            preselected=[],
            prior_selected_prop_ids=[],
        )
    )

    assert result == []
    assert model_calls == [None]
    assert settings_calls == [("EPISODE_PROP_PLANNER_THINKING_LEVEL", "low")]
    assert agent_kwargs["model"] == "prop-model"
    assert agent_kwargs["name"] == "场景块道具分析师"


def test_literal_script_writer_uses_literal_model_gateway_env(monkeypatch):
    import ai_anime.modules.narrative_planning.application.literal_script_writing as literal_script_writing

    model_calls = []
    settings_calls = []
    agent_kwargs = {}

    def fake_model_gateway_model():
        model_calls.append(None)
        return "literal-model"

    def fake_settings(thinking_env, default_thinking_level):
        settings_calls.append((thinking_env, default_thinking_level))
        return {"openai_reasoning_effort": default_thinking_level}

    class FakeAgent:
        def __init__(self, model, **kwargs):
            agent_kwargs["model"] = model
            agent_kwargs.update(kwargs)

    monkeypatch.setattr(
        literal_script_writing,
        "get_text_pydantic_model",
        fake_model_gateway_model,
    )
    monkeypatch.setattr(
        literal_script_writing,
        "get_text_pydantic_model_settings",
        fake_settings,
    )
    monkeypatch.setattr(literal_script_writing, "Agent", FakeAgent)

    workflow = literal_script_writing.LiteralScriptWritingWorkflow(cognee_store=None)

    assert workflow.agent is workflow.agent
    assert model_calls == [None]
    assert settings_calls == [("LITERAL_BEAT_META_THINKING_LEVEL", "low")]
    assert agent_kwargs["model"] == "literal-model"
    assert agent_kwargs["name"] == "逐行剧本分镜标注师"
    assert agent_kwargs["output_type"] is literal_script_writing.LiteralBeatMetaOutput
    assert agent_kwargs["retries"] == {"output": 2}


def test_ai_identity_detector_uses_model_gateway_detector_model_env(monkeypatch):
    from ai_anime.modules.model_usage import public as config
    import ai_anime.modules.production.infrastructure.global_video_optimizer as global_video_optimizer

    model_calls = []
    settings_calls = []
    agent_kwargs = {}

    def fake_model_gateway_model():
        model_calls.append(None)
        return "detector-model"

    def fake_settings(thinking_env, default_thinking_level):
        settings_calls.append((thinking_env, default_thinking_level))
        return {"openai_reasoning_effort": default_thinking_level}

    class FakeAgent:
        def __init__(self, model, **kwargs):
            agent_kwargs["model"] = model
            agent_kwargs.update(kwargs)

    monkeypatch.delenv("GLOBAL_VIDEO_MODEL", raising=False)
    monkeypatch.setattr(config, "get_text_pydantic_model", fake_model_gateway_model)
    monkeypatch.setattr(
        config, "get_text_pydantic_model_settings", fake_settings
    )
    monkeypatch.setattr(global_video_optimizer, "Agent", FakeAgent)

    global_video_optimizer._create_identity_detector_agent()

    assert model_calls == [None]
    assert settings_calls == [("GLOBAL_VIDEO_IDENTITY_DETECTOR_THINKING_LEVEL", "low")]
    assert agent_kwargs["model"] == "detector-model"
    assert agent_kwargs["name"] == "角色颜色识别"
    assert agent_kwargs["model_settings"] == {"openai_reasoning_effort": "low"}


def test_global_video_optimizer_uses_model_gateway_optimizer_model_env(monkeypatch):
    from ai_anime.modules.model_usage import public as config
    import ai_anime.modules.production.infrastructure.global_video_optimizer as global_video_optimizer

    model_calls = []
    settings_calls = []
    agent_kwargs = {}

    def fake_model_gateway_model():
        model_calls.append(None)
        return "optimizer-model"

    def fake_settings(thinking_env, default_thinking_level):
        settings_calls.append((thinking_env, default_thinking_level))
        return {"openai_reasoning_effort": default_thinking_level}

    class FakeAgent:
        def __init__(self, model, **kwargs):
            agent_kwargs["model"] = model
            agent_kwargs.update(kwargs)

    monkeypatch.delenv("GLOBAL_VIDEO_MODEL", raising=False)
    monkeypatch.setattr(config, "get_text_pydantic_model", fake_model_gateway_model)
    monkeypatch.setattr(
        config, "get_text_pydantic_model_settings", fake_settings
    )
    monkeypatch.setattr(global_video_optimizer, "Agent", FakeAgent)

    global_video_optimizer.create_global_video_optimizer_agent()

    assert model_calls == [None]
    assert settings_calls == [("GLOBAL_VIDEO_OPTIMIZER_THINKING_LEVEL", "low")]
    assert agent_kwargs["model"] == "optimizer-model"
    assert agent_kwargs["model_settings"] == {"openai_reasoning_effort": "low"}
    assert agent_kwargs["name"] == "Global Video Motion Director"
    assert agent_kwargs["output_type"] is str


def test_global_video_optimizer_empty_thinking_level_disables_settings(monkeypatch):
    from ai_anime.modules.model_usage import public as config
    import ai_anime.modules.production.infrastructure.global_video_optimizer as global_video_optimizer

    agent_kwargs = {}

    class FakeAgent:
        def __init__(self, model, **kwargs):
            agent_kwargs.update(kwargs)

    monkeypatch.setenv("GLOBAL_VIDEO_OPTIMIZER_THINKING_LEVEL", "")
    monkeypatch.setattr(
        config,
        "get_text_pydantic_model",
        lambda: "optimizer-model",
    )
    monkeypatch.setattr(
        config,
        "get_text_pydantic_model_settings",
        lambda thinking_env, default_thinking_level: None,
    )
    monkeypatch.setattr(global_video_optimizer, "Agent", FakeAgent)

    global_video_optimizer.create_global_video_optimizer_agent()

    assert "model_settings" not in agent_kwargs


def test_video_prompt_composer_uses_model_gateway_composer_model_env(monkeypatch):
    from ai_anime.modules.model_usage import public as config
    import ai_anime.modules.production.infrastructure.video_prompt_composer as video_prompt

    model_calls = []
    settings_calls = []
    agent_kwargs = {}

    def fake_model_gateway_model():
        model_calls.append(None)
        return "composer-model"

    def fake_settings(thinking_env, default_thinking_level):
        settings_calls.append((thinking_env, default_thinking_level))
        return {"openai_reasoning_effort": default_thinking_level}

    class FakeAgent:
        def __init__(self, model, **kwargs):
            agent_kwargs["model"] = model
            agent_kwargs.update(kwargs)

    monkeypatch.setattr(config, "get_text_pydantic_model", fake_model_gateway_model)
    monkeypatch.setattr(
        config, "get_text_pydantic_model_settings", fake_settings
    )
    monkeypatch.setattr("pydantic_ai.Agent", FakeAgent)

    video_prompt.create_video_prompt_composer_agent()

    assert model_calls == [None]
    assert settings_calls == [("VIDEO_PROMPT_COMPOSER_THINKING_LEVEL", "low")]
    assert agent_kwargs["model"] == "composer-model"
    assert agent_kwargs["model_settings"] == {"openai_reasoning_effort": "low"}
    assert agent_kwargs["name"] == "Video Prompt Composer"
    assert agent_kwargs["output_type"] is str
    assert "output_retries" not in agent_kwargs


def test_ai_identity_detector_can_pass_explicit_thinking_level(monkeypatch):
    from ai_anime.modules.model_usage import public as config
    import ai_anime.modules.production.infrastructure.global_video_optimizer as global_video_optimizer

    agent_kwargs = {}

    class FakeAgent:
        def __init__(self, model, **kwargs):
            agent_kwargs.update(kwargs)

    monkeypatch.setattr(
        config,
        "get_text_pydantic_model",
        lambda: "detector-model",
    )
    monkeypatch.setattr(
        config,
        "get_text_pydantic_model_settings",
        lambda thinking_env, default_thinking_level: {"openai_reasoning_effort": "low"},
    )
    monkeypatch.setattr(global_video_optimizer, "Agent", FakeAgent)

    global_video_optimizer._create_identity_detector_agent()

    assert agent_kwargs["model_settings"] == {"openai_reasoning_effort": "low"}
