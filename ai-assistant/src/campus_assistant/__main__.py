"""Run the service: python -m campus_assistant (reads ai-assistant/.env for local use)."""

from __future__ import annotations

import logging
import sys

import uvicorn

from .api import create_app
from .config import PACKAGE_ROOT, ConfigError, Settings, load_dotenv


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        settings = Settings.from_env(load_dotenv(PACKAGE_ROOT / ".env")).validate()
    except ConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    logging.getLogger("campus_assistant").info("starting %s", settings)
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, access_log=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
