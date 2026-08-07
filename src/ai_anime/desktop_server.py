# Copyright (c) 2026 AI anime
"""Desktop-only FastAPI launcher used by the packaged client."""

from __future__ import annotations

import argparse
import json
import os
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

DESKTOP_EVENT_PREFIX = "AI_ANIME_DESKTOP "


@dataclass(frozen=True)
class DesktopOptions:
    host: str
    port: int
    data_root: Path
    frontend_dist: Path | None
    ffmpeg_path: Path | None


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the bundled AI anime API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--frontend-dist", type=Path)
    parser.add_argument("--ffmpeg-path", type=Path)
    return parser


def parse_options(argv: Sequence[str] | None = None) -> DesktopOptions:
    args = _parser().parse_args(argv)
    if args.host not in {"127.0.0.1", "::1", "localhost"}:
        raise ValueError("the desktop API must bind to a loopback host")
    if not 0 <= args.port <= 65535:
        raise ValueError("desktop API port must be between 0 and 65535")
    return DesktopOptions(
        host=args.host,
        port=args.port,
        data_root=args.data_root.resolve(),
        frontend_dist=args.frontend_dist.resolve() if args.frontend_dist else None,
        ffmpeg_path=args.ffmpeg_path.resolve() if args.ffmpeg_path else None,
    )


def configure_environment(options: DesktopOptions) -> None:
    data_root = options.data_root
    output_dir = data_root / "output"
    state_dir = data_root / "state"
    runtime_dir = data_root / "runtime"
    for directory in (data_root, output_dir, state_dir, runtime_dir):
        directory.mkdir(parents=True, exist_ok=True)

    os.environ.pop("AI_ANIME_CONTROL_PLANE_DSN", None)
    os.environ.update(
        {
            "AI_ANIME_EDITION": "ce",
            "AI_ANIME_DESKTOP_MODE": "1",
            # 桌面端只走 loopback http，Secure Cookie 会被浏览器静默丢弃，
            # 导致登录会话无法持久化；桌面环境必须显式关闭 Secure。
            "AI_ANIME_COOKIE_SECURE": "0",
            "AI_ANIME_DATA_ROOT": str(data_root),
            "AI_ANIME_OUTPUT_DIR": str(output_dir),
            "AI_ANIME_STATE_DIR": str(state_dir),
            "AI_ANIME_RUNTIME_DIR": str(runtime_dir),
        }
    )
    token = os.environ.get("AI_ANIME_DESKTOP_TOKEN", "").strip()
    if not token:
        raise RuntimeError("AI_ANIME_DESKTOP_TOKEN is required")

    if options.frontend_dist is not None:
        if not options.frontend_dist.is_dir():
            raise FileNotFoundError(
                f"frontend distribution not found: {options.frontend_dist}"
            )
        os.environ["AI_ANIME_FRONTEND_DIST"] = str(options.frontend_dist)

    if options.ffmpeg_path is not None:
        if not options.ffmpeg_path.is_file():
            raise FileNotFoundError(f"ffmpeg not found: {options.ffmpeg_path}")
        os.environ["FFMPEG_PATH"] = str(options.ffmpeg_path)
        os.environ["PATH"] = (
            f"{options.ffmpeg_path.parent}{os.pathsep}{os.environ.get('PATH', '')}"
        )


def create_listening_socket(host: str, port: int) -> socket.socket:
    family = socket.AF_INET6 if host == "::1" else socket.AF_INET
    listener = socket.socket(family, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind((host, port))
    listener.listen(2048)
    return listener


def configure_local_api_environment(host: str, port: int) -> None:
    url_host = f"[{host}]" if ":" in host and not host.startswith("[") else host
    os.environ.update(
        {
            "AI_ANIME_API_HOST": host,
            "AI_ANIME_API_PORT": str(port),
            "AI_ANIME_API_URL": f"http://{url_host}:{port}",
        }
    )


def emit_event(event: str, **payload: object) -> None:
    print(
        DESKTOP_EVENT_PREFIX + json.dumps({"event": event, **payload}),
        flush=True,
    )


def main(argv: Sequence[str] | None = None) -> int:
    options = parse_options(argv)
    configure_environment(options)
    listener = create_listening_socket(options.host, options.port)
    bound_port = int(listener.getsockname()[1])
    configure_local_api_environment(options.host, bound_port)

    import uvicorn

    from ai_anime.api.app import create_app

    application = create_app()
    config = uvicorn.Config(
        application,
        host=options.host,
        port=bound_port,
        log_level="info",
        access_log=False,
    )
    server = uvicorn.Server(config)
    application.state.desktop_shutdown = lambda: setattr(
        server, "should_exit", True
    )
    emit_event("socket_bound", host=options.host, port=bound_port)
    server.run(sockets=[listener])
    emit_event("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
