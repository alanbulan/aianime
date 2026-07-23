"""API logging setup owned by the application composition root."""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from ai_anime.config import RUNTIME_DIR


def configure_api_logging() -> None:
    api_logger = logging.getLogger("ai_anime.api")
    api_logger.setLevel(logging.INFO)
    api_logger.propagate = True
    log_path = str(Path(RUNTIME_DIR) / "api.log")

    try:
        Path(RUNTIME_DIR).mkdir(parents=True, exist_ok=True)
        existing_handler = next(
            (
                handler
                for handler in api_logger.handlers
                if isinstance(handler, RotatingFileHandler)
                and getattr(handler, "baseFilename", "") == log_path
            ),
            None,
        )
        if existing_handler is not None:
            return

        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=10 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(message)s")
        )
        api_logger.addHandler(file_handler)
    except Exception:
        return
