from __future__ import annotations

def test_splat_transform_command_uses_native_binary(tmp_path, monkeypatch):
    from ai_anime.modules.asset_world.infrastructure.director_world import scene_package_tasks

    binary = tmp_path / "splat-transform.exe"
    binary.write_bytes(b"")
    monkeypatch.setenv("AI_ANIME_SPLAT_TRANSFORM_BIN", str(binary))
    monkeypatch.delenv("AI_ANIME_SPLAT_TRANSFORM_NODE", raising=False)

    command, child_env = scene_package_tasks._splat_transform_command()

    assert command == [str(binary)]
    assert child_env is None


def test_splat_transform_command_uses_packaged_node_runtime(tmp_path, monkeypatch):
    from ai_anime.modules.asset_world.infrastructure.director_world import scene_package_tasks

    cli = tmp_path / "cli.mjs"
    cli.write_text("", encoding="utf-8")
    node = tmp_path / "node.exe"
    node.write_bytes(b"")
    monkeypatch.setenv("AI_ANIME_SPLAT_TRANSFORM_BIN", str(cli))
    monkeypatch.setenv("AI_ANIME_SPLAT_TRANSFORM_NODE", str(node))

    command, child_env = scene_package_tasks._splat_transform_command()

    assert command == [str(node), str(cli)]
    assert child_env is not None
    assert "ELECTRON_RUN_AS_NODE" not in child_env
    assert child_env["AI_ANIME_SPLAT_TRANSFORM_BIN"] == str(cli)
    assert child_env["AI_ANIME_SPLAT_TRANSFORM_NODE"] == str(node)
