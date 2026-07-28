import pytest

from ai_anime.modules.ai_assistant.application import DisplayFallbacks


class StubDisplayFallbackGateway:
    def __init__(self, responses=None, failures=None):
        self.responses = responses or {}
        self.failures = failures or set()
        self.calls = []

    def get(self, path, token):
        self.calls.append((path, token))
        if path in self.failures:
            raise RuntimeError("gateway failed")
        return self.responses.get(path, {})


def _media_props(specs):
    assert len(specs) == 1
    spec = specs[0]
    children = spec["elements"][spec["root"]]["children"]
    return [spec["elements"][child]["props"] for child in children]


@pytest.mark.asyncio
async def test_display_fallback_rejects_unknown_tool_without_gateway_call():
    gateway = StubDisplayFallbackGateway()

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_pipeline_status",
        {},
        token="token",
    )

    assert specs == []
    assert gateway.calls == []


@pytest.mark.asyncio
async def test_display_fallback_does_not_use_pool_sketch_as_current_sketch():
    path = "/api/v1/projects/project-a/episodes/1/beats"
    gateway = StubDisplayFallbackGateway(
        {
            path: {
                "ok": True,
                "beats": [{"beat_number": 1, "sketch_url": "", "frame_url": ""}],
            }
        }
    )

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_get_sketches",
        {"episode": 1},
        token="token",
    )

    assert specs == []
    assert gateway.calls == [(path, "token")]


@pytest.mark.asyncio
async def test_display_fallback_prefers_api_project_id():
    path = "/api/v1/projects/api-project/episodes/1/beats"
    gateway = StubDisplayFallbackGateway(
        {
            path: {
                "ok": True,
                "beats": [
                    {
                        "beat_number": 1,
                        "sketch_url": "/static/projects/api-project/sketch.png?v=1",
                        "frame_url": "",
                    }
                ],
            }
        }
    )

    specs = await DisplayFallbacks(gateway).build(
        "chat-scope",
        "ai_anime_get_sketches",
        {"episode": 1, "project_id": "api-project"},
        token="token",
    )

    assert gateway.calls == [(path, "token")]
    assert _media_props(specs)[0]["src"] == (
        "/static/projects/api-project/sketch.png?v=1"
    )


@pytest.mark.asyncio
async def test_display_fallback_filters_requested_first_frames():
    path = "/api/v1/projects/project-a/episodes/2/beats"
    gateway = StubDisplayFallbackGateway(
        {
            path: {
                "data": {
                    "items": [
                        {
                            "beat_number": 1,
                            "sketch_url": "/sketch-1.png",
                            "frame_url": "/frame-1.png",
                        },
                        {
                            "beat_number": 2,
                            "sketch_url": "/sketch-2.png",
                            "frame_url": "/frame-2.png",
                        },
                    ]
                }
            }
        }
    )

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_get_first_frames",
        {"episode": 2, "beat_indices": [2]},
        token="token",
    )

    assert [item["src"] for item in _media_props(specs)] == ["/frame-2.png"]


@pytest.mark.asyncio
async def test_display_fallback_projects_stale_sketch_candidates():
    path = "/api/v1/projects/project-a/episodes/3/beats/4/sketch-candidates"
    gateway = StubDisplayFallbackGateway(
        {
            path: {
                "data": {
                    "candidates": [
                        {"url": "/candidate.png", "stale": True},
                        {"url": ""},
                    ]
                }
            }
        }
    )

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_get_sketch_candidates",
        {"episode": 3, "beat_number": 4},
        token="token",
    )

    props = _media_props(specs)[0]
    assert props["src"] == "/candidate.png"
    assert props["overlayDescription"] == "过期候选"


@pytest.mark.asyncio
async def test_display_fallback_filters_scene_images_and_optional_media():
    path = "/api/v1/projects/project-a/scenes"
    gateway = StubDisplayFallbackGateway(
        {
            path: {
                "scenes": [
                    {
                        "name": "室内客厅",
                        "scene_type": "interior",
                        "master_url": "/master.png",
                        "reverse_master_url": "/reverse.png",
                        "pano_url": "/pano.png",
                        "custom_scene_url": "/custom.png",
                    },
                    {
                        "name": "室外街道",
                        "scene_type": "exterior",
                        "master_url": "/street.png",
                    },
                ]
            }
        }
    )

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_get_scene_images",
        {
            "scene_name": "客厅",
            "scene_type": "interior",
            "include_reverse": False,
            "include_pano": True,
        },
        token="token",
    )

    props = _media_props(specs)
    assert [item["src"] for item in props] == ["/master.png", "/pano.png"]
    assert props[1]["aspectRatio"] == "16/9"


@pytest.mark.asyncio
async def test_display_fallback_loads_and_filters_character_identities():
    characters_path = "/api/v1/projects/project-a/characters"
    first_identity_path = (
        "/api/v1/projects/project-a/characters/%E5%B0%8F%E9%9B%85/identities"
    )
    second_identity_path = (
        "/api/v1/projects/project-a/characters/%E9%98%BF%E6%98%8E/identities"
    )
    gateway = StubDisplayFallbackGateway(
        {
            characters_path: {
                "characters": [
                    {"name": "小雅", "role": "战斗队长", "portrait_url": "/xiaoya.png"},
                    {"name": "阿明", "role": "医生", "portrait_url": "/aming.png"},
                ]
            },
            first_identity_path: {
                "data": {
                    "identities": [
                        {"identity_name": "战斗服", "image_url": "/fighter.png"}
                    ]
                }
            },
            second_identity_path: {"identities": []},
        }
    )

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_get_character_media",
        {"media_kind": "identity", "name": "小雅", "query": "战斗"},
        token="token",
    )

    assert [path for path, _token in gateway.calls] == [
        characters_path,
        first_identity_path,
        second_identity_path,
    ]
    props = _media_props(specs)
    assert [item["src"] for item in props] == ["/fighter.png"]
    assert props[0]["title"] == "小雅 · 战斗服"


@pytest.mark.asyncio
async def test_display_fallback_uses_inline_identity_when_identity_query_fails():
    characters_path = "/api/v1/projects/project-a/characters"
    identity_path = "/api/v1/projects/project-a/characters/Ada/identities"
    gateway = StubDisplayFallbackGateway(
        {
            characters_path: {
                "characters": [
                    {
                        "name": "Ada",
                        "identities": [
                            {"identity_name": "Pilot", "image_url": "/pilot.png"}
                        ],
                    }
                ]
            }
        },
        failures={identity_path},
    )

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_get_character_media",
        {"media_kind": "identity"},
        token="token",
    )

    assert [item["src"] for item in _media_props(specs)] == ["/pilot.png"]


@pytest.mark.asyncio
async def test_display_fallback_projects_filtered_episode_audio():
    path = "/api/v1/projects/project-a/episodes/1/beats"
    gateway = StubDisplayFallbackGateway(
        {
            path: {
                "beats": [
                    {
                        "beat_number": 1,
                        "character_names": ["阿明"],
                        "audio_url": "/one.mp3",
                    },
                    {
                        "beat_number": 2,
                        "character_names": ["小雅"],
                        "audio_url": "/two.mp3",
                        "video_url": "/two.mp4",
                    },
                ]
            }
        }
    )

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_get_episode_media",
        {"media_type": "audio", "beat": 2, "query": "小雅"},
        token="token",
    )

    props = _media_props(specs)
    assert [item["src"] for item in props] == ["/two.mp3"]
    assert props[0]["controls"] is True


@pytest.mark.asyncio
async def test_display_fallback_swallows_primary_gateway_failure():
    path = "/api/v1/projects/project-a/scenes"
    gateway = StubDisplayFallbackGateway(failures={path})

    specs = await DisplayFallbacks(gateway).build(
        "project-a",
        "ai_anime_get_scene_images",
        {},
        token="token",
    )

    assert specs == []
