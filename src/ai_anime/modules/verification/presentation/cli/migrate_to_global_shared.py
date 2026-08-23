"""Compatibility entry point for the centralized shared-state migration."""

import sys

from ai_anime.migrations.verification.global_shared import *  # noqa: F403


if __name__ == "__main__":
    sys.exit(main())  # noqa: F405
