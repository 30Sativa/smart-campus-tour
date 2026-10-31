"""Read an operator-provisioned credential from a protected file."""

from __future__ import annotations

import os
import stat
from pathlib import Path


def read_credential(path: str) -> str:
    if not path:
        raise ValueError('FLEET_ROBOT_CREDENTIAL_FILE must be configured')
    try:
        credential_path = Path(path)
        metadata = credential_path.stat()
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError('credential file must be a regular file')
        if os.name != 'nt' and stat.S_IMODE(metadata.st_mode) & 0o077:
            raise ValueError('credential file must not be accessible by group or other users')
        credential = credential_path.read_text(encoding='utf-8').strip()
    except ValueError:
        raise
    except (OSError, UnicodeDecodeError):
        raise ValueError('credential file could not be read') from None
    if not credential or any(char.isspace() for char in credential):
        raise ValueError('credential file must contain one non-empty token')
    return credential
