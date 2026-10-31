#!/usr/bin/env python3
"""Fail-closed NTP readiness gate for Fleet Bridge startup."""

from __future__ import annotations

import csv
import datetime as dt
import ipaddress
import io
import math
import os
import re
import shutil
import subprocess
import sys
import time

# Fleet Sync v1 accepts reports up to 5 s in the future and considers reports
# older than 30 s stale. Keep the measured system offset at <=2 s, and require
# a <=1 s upstream root-distance bound as an independent accuracy check.
MAX_ABS_OFFSET_SECONDS = 2.0
MAX_ROOT_DISTANCE_SECONDS = 1.0

# chrony can poll at up to 1024 s with common defaults. 30 min tolerates one
# missed poll while rejecting a disconnected source; root distance remains
# bounded separately. The 5 s future tolerance matches the Fleet Sync API.
MAX_REFERENCE_AGE_SECONDS = 1800.0
MAX_REFERENCE_FUTURE_SECONDS = 5.0

_NUMBER_UNIT = re.compile(
    r'^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*'
    r'(ns|us|µs|ms|s|sec|secs|second|seconds)?\s*$',
    re.IGNORECASE,
)
_INVALID_REFERENCE_IDS = {
    '7F7F0101', '00000000', '127.127.1.1', '0.0.0.0', '?', 'N/A', 'NA',
    'NONE', 'UNKNOWN', '-', 'NAN',
}
_CHRONY_TRACKING_FIELDS = 14


def _seconds(value: str) -> float | None:
    match = _NUMBER_UNIT.match(value)
    if match is None:
        return None
    try:
        amount = float(match.group(1))
    except ValueError:
        return None
    if not math.isfinite(amount):
        return None
    unit = (match.group(2) or 's').lower()
    scale = {'ns': 1e-9, 'us': 1e-6, 'µs': 1e-6, 'ms': 1e-3}.get(unit, 1.0)
    return amount * scale


def _finite_number(value: str) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _reference_age_result(reference_epoch: float, now_epoch: float) -> tuple[bool, str]:
    age = now_epoch - reference_epoch
    if age < -MAX_REFERENCE_FUTURE_SECONDS:
        return False, 'time synchronization reference timestamp is too far in the future'
    if age > MAX_REFERENCE_AGE_SECONDS:
        return False, (
            f'time synchronization reference is stale ({age:.0f}s; '
            f'maximum {MAX_REFERENCE_AGE_SECONDS:.0f}s)'
        )
    return True, f'reference age {max(age, 0.0):.0f}s'


def _check_root_distance(root_delay: float, root_dispersion: float,
                         source: str) -> tuple[bool, str, float]:
    if root_delay < 0 or root_dispersion < 0:
        return False, f'{source} reported a negative root delay or dispersion', 0.0
    root_distance = root_delay / 2.0 + root_dispersion
    if root_distance > MAX_ROOT_DISTANCE_SECONDS:
        return False, (
            f'{source} root distance {root_distance:.3f}s exceeds '
            f'{MAX_ROOT_DISTANCE_SECONDS:.1f}s'
        ), root_distance
    return True, f'root distance {root_distance:.3f}s', root_distance


def _check_offset(source: str, offset: float) -> tuple[bool, str]:
    absolute = abs(offset)
    if absolute > MAX_ABS_OFFSET_SECONDS:
        return False, f'{source} offset {absolute:.3f}s exceeds {MAX_ABS_OFFSET_SECONDS:.1f}s'
    return True, f'absolute offset {absolute:.3f}s'


def _valid_reference_id(reference_id: str, *, chrony: bool) -> bool:
    refid = reference_id.strip().upper()
    if not refid or refid in _INVALID_REFERENCE_IDS:
        return False
    if chrony:
        return re.fullmatch(r'[0-9A-F]{8}', refid) is not None
    # systemd-timesyncd formats stratum-1 reference-clock names as up to four
    # printable ASCII characters; network sources are formatted as 8 hex digits.
    return (re.fullmatch(r'[0-9A-F]{8}', refid) is not None or
            (len(refid) <= 4 and refid.isascii() and refid.isprintable()))


def check_chrony_tracking(output: str, now_epoch: float | None = None) -> tuple[bool, str]:
    """Validate `chronyc -c tracking` output, rejecting incomplete evidence."""
    try:
        rows = list(csv.reader(io.StringIO(output.strip())))
    except (csv.Error, TypeError):
        return False, 'chrony CSV tracking output could not be parsed'
    if len(rows) != 1 or len(rows[0]) != _CHRONY_TRACKING_FIELDS:
        return False, 'chrony CSV tracking output has missing or unexpected fields'

    fields = [field.strip() for field in rows[0]]
    if not _valid_reference_id(fields[0], chrony=True):
        return False, 'chrony reference ID is missing, invalid, or local fallback'
    if not fields[1] or fields[1] in {'?', 'n/a', 'N/A'}:
        return False, 'chrony has no identifiable synchronization source'
    try:
        stratum = int(fields[2])
    except ValueError:
        return False, 'chrony stratum could not be parsed'
    if not 1 <= stratum <= 15:
        return False, 'chrony stratum is outside the synchronized range 1..15'

    # Validate every numeric CSV field, not only the values used below. This
    # makes truncated, shifted, or partially unparsable output fail closed.
    numeric: list[float] = []
    for field in fields[3:13]:
        value = _finite_number(field)
        if value is None:
            return False, 'chrony CSV tracking output contains an invalid numeric field'
        numeric.append(value)
    ref_time = numeric[0]
    system_offset = numeric[1]
    root_delay = numeric[7]
    root_dispersion = numeric[8]
    if ref_time <= 0:
        return False, 'chrony reference timestamp is invalid'
    if fields[13].lower() not in {'normal', 'n'}:
        return False, 'chrony is not synchronized (leap status is not Normal)'

    now = time.time() if now_epoch is None else now_epoch
    age_ok, age_message = _reference_age_result(ref_time, now)
    if not age_ok:
        return False, age_message
    distance_ok, distance_message, _ = _check_root_distance(
        root_delay, root_dispersion, 'chrony')
    if not distance_ok:
        return False, distance_message
    offset_ok, offset_message = _check_offset('chrony', system_offset)
    if not offset_ok:
        return False, offset_message
    return True, f'chrony synchronized; {offset_message}; {distance_message}; {age_message}'


def _properties(output: str) -> dict[str, str]:
    properties: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition('=')
        if separator:
            properties[key.strip()] = value.strip()
    return properties


def _systemd_message_value(message: str, field: str) -> str | None:
    match = re.search(rf'(?:^|,\s*){re.escape(field)}=([^,}}]+)', message)
    return match.group(1).strip() if match else None


def _systemd_timestamp(value: str) -> float | None:
    # systemd v249 (Ubuntu 22.04) emits timestamps as
    # "Thu 2026-10-22 10:00:00 UTC". TZ=UTC and LC_ALL=C are set for the
    # subprocess so this representation is deterministic.
    for format_string in ('%a %Y-%m-%d %H:%M:%S %Z',
                          '%a %Y-%m-%d %H:%M:%S.%f %Z'):
        try:
            parsed = dt.datetime.strptime(value.strip(), format_string)
            return parsed.replace(tzinfo=dt.timezone.utc).timestamp()
        except ValueError:
            continue
    return None


def _valid_timesyncd_server_address(value: str) -> bool:
    if not value:
        return False
    address = value.split('%', 1)[0]
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    return not (parsed.is_unspecified or parsed.is_multicast or parsed.is_loopback)


def check_timesyncd(sync_output: str, status_output: str, properties_output: str,
                    now_epoch: float | None = None) -> tuple[bool, str]:
    """Validate sync state plus systemd-timesyncd's last accepted NTP packet."""
    if sync_output.strip().lower() != 'yes':
        return False, 'system clock is not NTP synchronized'
    offset_match = re.search(r'^\s*Offset\s*:\s*(.+?)\s*$', status_output,
                             re.MULTILINE | re.IGNORECASE)
    if offset_match is None:
        return False, 'timedatectl did not report an NTP offset'
    offset = _seconds(offset_match.group(1))
    if offset is None:
        return False, 'timedatectl NTP offset could not be parsed'

    props = _properties(properties_output)
    if not _valid_timesyncd_server_address(props.get('ServerAddress', '')):
        return False, 'systemd-timesyncd has no valid current NTP server address'
    ntp_message = props.get('NTPMessage', '')
    if not ntp_message.startswith('{') or not ntp_message.endswith('}'):
        return False, 'timedatectl did not expose a complete NTPMessage'
    message = ntp_message[1:-1].strip()

    def integer_field(name: str) -> int | None:
        value = _systemd_message_value(message, name)
        if value is None:
            return None
        try:
            return int(value)
        except ValueError:
            return None

    leap = integer_field('Leap')
    version = integer_field('Version')
    mode = integer_field('Mode')
    stratum = integer_field('Stratum')
    packet_count_match = re.search(r'\bPacketCount=(\d+)\b', message)
    ignored_match = re.search(r'\bIgnored=(yes|no)\b', message, re.IGNORECASE)
    if None in (leap, version, mode, stratum) or packet_count_match is None or ignored_match is None:
        return False, 'timedatectl NTPMessage has missing or invalid fields'
    if leap != 0 or version not in {3, 4} or mode != 4 or not 1 <= stratum <= 15:
        return False, 'systemd-timesyncd last NTP message is not synchronized'
    if int(packet_count_match.group(1)) < 1 or ignored_match.group(1).lower() != 'no':
        return False, 'systemd-timesyncd has no accepted NTP sample'

    refid = _systemd_message_value(message, 'Reference')
    if refid is None or not _valid_reference_id(refid, chrony=False):
        return False, 'systemd-timesyncd reference ID is missing, invalid, or local fallback'
    # A stratum-1 reference-clock name is not a hex RefID. Other strata must
    # have the 8-hex-digit network reference ID used by systemd-timesyncd.
    if stratum > 1 and re.fullmatch(r'[0-9A-Fa-f]{8}', refid) is None:
        return False, 'systemd-timesyncd network reference ID is malformed'
    if stratum == 1 and (not refid.isascii() or not refid.isprintable()):
        return False, 'systemd-timesyncd reference-clock ID is malformed'

    root_delay_text = _systemd_message_value(message, 'RootDelay')
    root_dispersion_text = _systemd_message_value(message, 'RootDispersion')
    destination_text = _systemd_message_value(message, 'DestinationTimestamp')
    if None in (root_delay_text, root_dispersion_text, destination_text):
        return False, 'timedatectl NTPMessage has no root distance or receive timestamp'
    root_delay = _seconds(root_delay_text)
    root_dispersion = _seconds(root_dispersion_text)
    destination_time = _systemd_timestamp(destination_text)
    if root_delay is None or root_dispersion is None or destination_time is None:
        return False, 'timedatectl NTPMessage contains an unparsable quality field'

    now = time.time() if now_epoch is None else now_epoch
    age_ok, age_message = _reference_age_result(destination_time, now)
    if not age_ok:
        return False, age_message
    distance_ok, distance_message, _ = _check_root_distance(
        root_delay, root_dispersion, 'systemd-timesyncd')
    if not distance_ok:
        return False, distance_message
    offset_ok, offset_message = _check_offset('systemd-timesyncd', offset)
    if not offset_ok:
        return False, offset_message
    return True, (
        f'systemd-timesyncd synchronized; {offset_message}; '
        f'{distance_message}; {age_message}'
    )


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        timeout=5,
        env={**os.environ, 'LC_ALL': 'C', 'TZ': 'UTC'},
    )


def check_host_time() -> tuple[bool, str]:
    chronyc = shutil.which('chronyc')
    if chronyc:
        try:
            result = _run([chronyc, '-c', 'tracking'])
        except (OSError, subprocess.TimeoutExpired):
            return False, 'chronyc CSV tracking could not complete'
        if result.returncode != 0:
            return False, 'chronyc CSV tracking failed; check chronyd service and NTP sources'
        return check_chrony_tracking(result.stdout)

    timedatectl = shutil.which('timedatectl')
    if not timedatectl:
        return False, 'neither chronyc nor timedatectl is available'
    try:
        synchronized = _run([timedatectl, 'show', '--property=NTPSynchronized', '--value'])
        status = _run([timedatectl, 'timesync-status'])
        properties = _run([timedatectl, 'show-timesync', '--all'])
    except (OSError, subprocess.TimeoutExpired):
        return False, 'timedatectl NTP status could not be read'
    if any(result.returncode != 0 for result in (synchronized, status, properties)):
        return False, 'timedatectl NTP status check failed'
    return check_timesyncd(synchronized.stdout, status.stdout, properties.stdout)


def main() -> int:
    ok, message = check_host_time()
    if ok:
        print(f'PASS: {message}; Fleet Bridge startup time gate satisfied.')
        return 0
    print(f'FAIL: {message}. Synchronize the system clock before Fleet Bridge launch.',
          file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
