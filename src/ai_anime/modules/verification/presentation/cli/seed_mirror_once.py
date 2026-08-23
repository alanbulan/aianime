"""Compatibility entry point for the centralized verification migration."""

import sys

from ai_anime.migrations.verification.seed_mirror_once import *  # noqa: F403


if __name__ == "__main__":
    sys.exit(main())  # noqa: F405
