"""Mini PC diagnostics for `POST /api/fleet/v1/diagnostics` (pure Python, no ROS).

The report is observation only: it never changes Fleet Sync, navigation or commands. Every value the
collector cannot measure is sent as null ("could not measure"), never as zero, so the Technical dashboard
can tell a missing reading from a real one. Resources come from Linux /proc, /sys and statvfs; the bridge
adds ROS topic rates and the stm32_bridge IMU diagnostic through `diagnostics_ros`.
"""

from __future__ import annotations

import http.client
import json
import os
import random
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from .http_client import FleetSyncHttpClient, HttpResponse, TransportFailure
from .protocol import utc_iso

# Thermal zone types that measure the CPU package, best first; `acpitz` is a board sensor fallback.
CPU_THERMAL_TYPES = ('x86_pkg_temp', 'coretemp', 'cpu-thermal', 'cpu_thermal', 'k10temp', 'soc_thermal', 'acpitz')

# diagnostic_msgs/DiagnosticStatus levels -> backend sensor status.
DIAGNOSTIC_LEVELS = {0: 'OK', 1: 'WARN', 2: 'ERROR', 3: 'STALE'}


def diagnostics_url_from_sync_url(sync_url: str) -> str:
    suffix = '/api/fleet/v1/sync'
    if not sync_url.endswith(suffix):
        raise ValueError('Set diagnostics_url: FLEET_SYNC_URL does not end with the Fleet Sync path')
    return sync_url[:-len(suffix)] + '/api/fleet/v1/diagnostics'


# ------------------------------------------------------------------ Mini PC resources

class CpuSampler:
    """CPU busy percent between two /proc/stat reads; the first call has no interval yet and returns None."""

    def __init__(self, read_stat: Callable[[], str] | None = None):
        self._read_stat = read_stat or (lambda: Path('/proc/stat').read_text(encoding='ascii'))
        self._previous: Optional[tuple[int, int]] = None

    def sample(self) -> Optional[float]:
        try:
            current = _cpu_totals(self._read_stat())
        except (OSError, ValueError):
            self._previous = None
            return None
        previous, self._previous = self._previous, current
        if previous is None:
            return None
        total = current[0] - previous[0]
        idle = current[1] - previous[1]
        if total <= 0 or idle < 0:
            return None
        return round(min(100.0, max(0.0, 100.0 * (total - idle) / total)), 1)


def _cpu_totals(stat_text: str) -> tuple[int, int]:
    for line in stat_text.splitlines():
        fields = line.split()
        if fields and fields[0] == 'cpu':
            values = [int(value) for value in fields[1:]]
            if len(values) < 4:
                break
            # guest/guest_nice are already counted in user/nice.
            total = sum(values[:8])
            idle = values[3] + (values[4] if len(values) > 4 else 0)  # idle + iowait
            return total, idle
    raise ValueError('aggregate cpu line not found')


def memory_from_meminfo(meminfo_text: str) -> Optional[dict]:
    values: dict[str, int] = {}
    for line in meminfo_text.splitlines():
        name, _, rest = line.partition(':')
        parts = rest.split()
        if parts and parts[0].isdigit():
            values[name.strip()] = int(parts[0]) * 1024  # kB
    total = values.get('MemTotal')
    available = values.get('MemAvailable')
    if not total or available is None or available > total:
        return None
    used = total - available
    return {'totalBytes': total, 'availableBytes': available, 'usedBytes': used,
            'usedPercent': round(100.0 * used / total, 1)}


def disk_usage(path: str, statvfs: Callable[[str], object] = os.statvfs) -> Optional[dict]:
    try:
        stats = statvfs(path)
    except OSError:
        return None
    total = stats.f_blocks * stats.f_frsize
    free_for_user = stats.f_bavail * stats.f_frsize
    used = (stats.f_blocks - stats.f_bfree) * stats.f_frsize
    if total <= 0:
        return None
    # Same basis as `df`: used / (used + available to unprivileged users).
    usable = used + free_for_user
    return {'mountPoint': path, 'totalBytes': total, 'availableFreeBytes': free_for_user,
            'usedPercent': round(100.0 * used / usable, 1) if usable > 0 else 100.0}


def cpu_temperature(thermal_root: str = '/sys/class/thermal') -> Optional[float]:
    """Hottest zone of the best CPU zone type present, in degrees Celsius; None when no CPU zone exists."""
    readings: dict[str, list[float]] = {}
    try:
        zones = sorted(Path(thermal_root).glob('thermal_zone*'))
    except OSError:
        return None
    for zone in zones:
        try:
            zone_type = (zone / 'type').read_text(encoding='ascii').strip()
            millidegrees = int((zone / 'temp').read_text(encoding='ascii').strip())
        except (OSError, ValueError):
            continue
        celsius = millidegrees / 1000.0
        if -40.0 <= celsius <= 150.0:  # backend bound; anything else is a broken sensor
            readings.setdefault(zone_type, []).append(celsius)
    for zone_type in CPU_THERMAL_TYPES:
        if zone_type in readings:
            return round(max(readings[zone_type]), 1)
    return None


class MiniPcCollector:
    def __init__(self, disk_path: str = '/', proc_root: str = '/proc', thermal_root: str = '/sys/class/thermal'):
        self.disk_path = disk_path
        self._proc = Path(proc_root)
        self._thermal_root = thermal_root
        self._cpu = CpuSampler(lambda: (self._proc / 'stat').read_text(encoding='ascii'))

    def collect(self) -> dict:
        try:
            memory = memory_from_meminfo((self._proc / 'meminfo').read_text(encoding='ascii'))
        except OSError:
            memory = None
        return {
            'cpuPercent': self._cpu.sample(),
            'memory': memory,
            # GPU load is not measured on the robot Mini PC; null means "could not measure", not "no GPU".
            'gpu': None,
            'disk': disk_usage(self.disk_path),
            'cpuTemperatureCelsius': cpu_temperature(self._thermal_root),
        }


# ------------------------------------------------------------------ ROS observations (fed by diagnostics_ros)

class TopicRate:
    """Arrival times of one topic; thread-safe because ROS callbacks and the HTTPS thread both touch it."""

    def __init__(self, window_sec: float = 5.0, clock: Callable[[], float] = time.monotonic,
                 wall_clock: Callable[[], datetime] | None = None):
        self.window_sec = window_sec
        self._clock = clock
        self._wall_clock = wall_clock or (lambda: datetime.now(timezone.utc))
        self._arrivals: deque[float] = deque()
        self._last_mono: Optional[float] = None
        self._last_wall: Optional[datetime] = None
        self._lock = threading.Lock()

    def tick(self) -> None:
        now = self._clock()
        wall = self._wall_clock()
        with self._lock:
            self._arrivals.append(now)
            self._last_mono = now
            self._last_wall = wall
            self._trim(now)

    def snapshot(self) -> tuple[Optional[float], Optional[float], Optional[datetime]]:
        """(rate Hz over the window or None, seconds since the last message or None, last message UTC)."""
        now = self._clock()
        with self._lock:
            self._trim(now)
            count = len(self._arrivals)
            last = self._last_mono
            last_wall = self._last_wall
        age = None if last is None else max(0.0, now - last)
        rate = round(count / self.window_sec, 1) if count >= 2 else None
        return rate, age, last_wall

    def _trim(self, now: float) -> None:
        while self._arrivals and now - self._arrivals[0] > self.window_sec:
            self._arrivals.popleft()


def topic_sensor_status(topic: str, rate: TopicRate | None, stale_after_sec: float, min_rate_hz: float) -> dict:
    """One sensor from its topic. An empty topic name means the robot has no such sensor."""
    if not topic or rate is None:
        return {'status': 'NOT_EQUIPPED', 'message': None, 'rateHz': None, 'lastValidAt': None}
    hz, age, last_wall = rate.snapshot()
    last_valid = utc_iso(last_wall) if last_wall is not None else None
    if last_wall is None:
        return {'status': 'UNKNOWN', 'message': f'Chưa nhận dữ liệu từ {topic}.', 'rateHz': None,
                'lastValidAt': None}
    if age is None or age > stale_after_sec:
        return {'status': 'STALE', 'message': f'{topic} không còn cập nhật.', 'rateHz': None,
                'lastValidAt': last_valid}
    if hz is not None and hz < min_rate_hz:
        return {'status': 'WARN', 'message': f'{topic} chậm hơn {min_rate_hz:g} Hz.', 'rateHz': hz,
                'lastValidAt': last_valid}
    return {'status': 'OK', 'message': None, 'rateHz': hz, 'lastValidAt': last_valid}


@dataclass(frozen=True)
class ImuDiagnostic:
    level: int
    message: str
    values: dict[str, str]
    received_at: datetime
    received_mono: float


def imu_sensor_status(diagnostic: Optional[ImuDiagnostic], imu_rate: TopicRate | None, now_mono: float,
                      stale_after_sec: float) -> dict:
    """IMU from the stm32_bridge `<node>: imu` diagnostic; without it only the imu topic rate is known."""
    base = {'yawValid': None, 'firmwareRearmCount': None, 'firmwareResetSeenCount': None, 'outages': 0}
    if diagnostic is None:
        topic = topic_sensor_status('imu', imu_rate, stale_after_sec, 0.0) if imu_rate is not None else None
        status = topic['status'] if topic else 'UNKNOWN'
        last_valid = topic['lastValidAt'] if topic else None
        if status == 'NOT_EQUIPPED':  # not a valid IMU state on the wire
            status = 'UNKNOWN'
        return {**base, 'status': status, 'lastValidAt': last_valid,
                'message': 'Chưa nhận chẩn đoán IMU từ stm32_bridge (/diagnostics).'}
    if now_mono - diagnostic.received_mono > stale_after_sec:
        return {**base, 'status': 'STALE', 'message': 'Chẩn đoán IMU từ stm32_bridge không còn cập nhật.',
                'lastValidAt': None, 'outages': _int(diagnostic.values.get('outages')) or 0}
    status = DIAGNOSTIC_LEVELS.get(diagnostic.level, 'UNKNOWN')
    last_valid = None
    age = _float(diagnostic.values.get('last_valid_age_s'))
    if age is not None:
        last_valid = utc_iso(diagnostic.received_at - timedelta(seconds=age))
    return {
        'status': status,
        'message': diagnostic.message or None,
        # Yaw is valid exactly when the bridge reports the IMU OK with a measured last-valid age.
        'yawValid': (status == 'OK') if age is not None else None,
        'firmwareRearmCount': _int(diagnostic.values.get('firmware_rearm_count')),
        'firmwareResetSeenCount': _int(diagnostic.values.get('firmware_reset_seen_count')),
        'outages': _int(diagnostic.values.get('outages')) or 0,
        'lastValidAt': last_valid,
    }


def _int(value: Optional[str]) -> Optional[int]:
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def _float(value: Optional[str]) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def build_diagnostics_report(robot_code: str, reported_at: datetime, mini_pc: Optional[dict],
                             ros2: Optional[dict], sensors: Optional[dict]) -> dict:
    return {'robotId': robot_code, 'reportedAt': utc_iso(reported_at), 'miniPc': mini_pc,
            'ros2': ros2, 'sensors': sensors}


# ------------------------------------------------------------------ HTTPS loop

@dataclass(frozen=True)
class DiagnosticsWorkerConfig:
    report_period_sec: float = 10.0
    retry_max_sec: float = 60.0


class FleetDiagnosticsHttpClient(FleetSyncHttpClient):
    """Same credential, TLS and response bounds as Fleet Sync; `url` is the full diagnostics endpoint."""


class FleetDiagnosticsWorker:
    """Sends one fresh report per period on its own thread; a failure never blocks Fleet Sync or ROS callbacks.

    Reports are snapshots, not a stream: a failed one is dropped, never retried, and the next period sends
    a new one. Repeated failures stretch the period up to `retry_max_sec`.
    """

    def __init__(self, config: DiagnosticsWorkerConfig, transport: object, report_provider: Callable[[], dict],
                 on_log=None, stop_event: threading.Event | None = None, wait=None, random_source=None):
        self.config = config
        self.transport = transport
        self.report_provider = report_provider
        self.on_log = on_log or (lambda message: None)
        self.stop_event = stop_event or threading.Event()
        self.wait = wait or self.stop_event.wait
        self.random_source = random_source or random.random
        self._thread: threading.Thread | None = None
        self._failures = 0
        self._last_log: str | None = None

    def start(self) -> None:
        if self._thread is not None:
            raise RuntimeError('Fleet diagnostics worker already started')
        self._thread = threading.Thread(target=self.run, name='fleet-diagnostics-https', daemon=True)
        self._thread.start()

    def stop(self, join_timeout_sec: float = 3.0) -> None:
        self.stop_event.set()
        if self._thread is not None:
            self._thread.join(join_timeout_sec)

    def run(self) -> None:
        # Wait one period first: the CPU share needs two samples and sensor rates need messages.
        while not self.wait(self._delay()):
            try:
                healthy = self.run_once()
            except Exception as error:  # noqa: BLE001 - monitoring must not kill the bridge process
                self._note(f'Diagnostics report error ({type(error).__name__}).')
                healthy = False
            self._failures = 0 if healthy else min(self._failures + 1, 16)

    def run_once(self) -> bool:
        body = json.dumps(self.report_provider(), separators=(',', ':'), ensure_ascii=False)
        try:
            response = self.transport.post(body)
        except (TransportFailure, http.client.HTTPException, OSError, TimeoutError) as error:
            self._note(f'Diagnostics report failed ({getattr(error, "kind", type(error).__name__)}).')
            return False
        if response.status != 200:
            self._note(f'Diagnostics report refused: {_code(response)}.')
            return False
        if self._last_log is not None:
            self.on_log('Diagnostics report accepted again.')
        self._last_log = None
        return True

    def _delay(self) -> float:
        period = self.config.report_period_sec
        if self._failures:
            period = min(self.config.retry_max_sec, period * (2 ** (self._failures - 1)))
        return max(1.0, period * (0.9 + 0.2 * self.random_source()))

    def _note(self, message: str) -> None:
        if message != self._last_log:
            self._last_log = message
            self.on_log(message)


def _code(response: HttpResponse) -> str:
    body = response.body
    errors = body.get('errors') if isinstance(body, dict) else None
    code = errors.get('code') if isinstance(errors, dict) else None
    return code if isinstance(code, str) else f'http_{response.status}'
