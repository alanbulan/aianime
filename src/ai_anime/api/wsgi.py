"""ASGI entrypoint for the standalone AI anime API."""

from ai_anime.env import load_project_dotenv

load_project_dotenv(override=False)

from ai_anime.api.app import app  # noqa: F401
