"""Bounded standard-library HTTPS clients for Fleet Sync v1 and Fleet Commands v1."""

from __future__ import annotations

import http.client
import json
import ssl
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from urllib.parse import urlsplit

MAX_RESPONSE_BYTES = 16 * 1024


@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: object
    retry_after: str | None = None


class TransportFailure(Exception):
    """Network failure whose message never includes URL headers or secrets."""

    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def validate_url(url: str) -> str:
    try:
        parts = urlsplit(url)
        hostname = parts.hostname
        _ = parts.port
    except ValueError as error:
        raise ValueError('FLEET_SYNC_URL is not a valid URL') from error

    if not parts.netloc or hostname is None or parts.username is not None or parts.password is not None:
        raise ValueError('FLEET_SYNC_URL must be absolute and contain no embedded credentials')
    is_loopback_http = parts.scheme == 'http' and hostname in {'localhost', '127.0.0.1', '::1'}
    if parts.scheme != 'https' and not is_loopback_http:
        raise ValueError('FLEET_SYNC_URL must use HTTPS; HTTP is allowed only for loopback tests')
    if parts.query or parts.fragment:
        raise ValueError('FLEET_SYNC_URL must not contain a query or fragment')
    return url


def verified_tls_context() -> ssl.SSLContext:
    """Use platform roots and hostname checks; no insecure mode is exposed."""
    return ssl.create_default_context()


class FleetSyncHttpClient:
    def __init__(self, url: str, robot_code: str, credential: str, timeout_sec: float = 5.0):
        self.url = validate_url(url)
        self.robot_code = robot_code
        self._credential = credential
        self.timeout_sec = timeout_sec

    def post(self, body: str) -> HttpResponse:
        return self._post(self.url, body)

    def _post(self, url: str, body: str) -> HttpResponse:
        return self._send(url, 'POST', body.encode('utf-8'))

    def _get(self, url: str) -> HttpResponse:
        return self._send(url, 'GET', None)

    def _send(self, url: str, method: str, data: bytes | None) -> HttpResponse:
        headers = {
            'Authorization': f'Bearer {self._credential}',
            'X-Robot-Code': self.robot_code,
            'Accept': 'application/json',
        }
        if data is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        handlers: list[urllib.request.BaseHandler] = [NoRedirect()]
        if self.url.startswith('https://'):
            handlers.append(urllib.request.HTTPSHandler(context=verified_tls_context()))
        opener = urllib.request.build_opener(*handlers)
        try:
            with opener.open(request, timeout=self.timeout_sec) as response:
                return self._read_response(response.status, response.headers, response)
        except urllib.error.HTTPError as error:
            return self._read_response(error.code, error.headers, error)
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError) as error:
            # Do not include exception text; some URL handlers include request context.
            raise TransportFailure(type(error).__name__) from None

    @staticmethod
    def _read_response(status: int, headers: object, response: object) -> HttpResponse:
        try:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
        except (http.client.HTTPException, TimeoutError, OSError) as error:
            # An incomplete response is a transport uncertainty, even when the
            # status line was 200. The worker will retry the exact request body.
            raise TransportFailure(type(error).__name__) from None
        if len(raw) > MAX_RESPONSE_BYTES:
            return HttpResponse(status, None, _header(headers, 'Retry-After'))
        try:
            body = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            body = None
        return HttpResponse(status, body, _header(headers, 'Retry-After'))


class FleetCommandsHttpClient(FleetSyncHttpClient):
    """Same credential, TLS and bounds as Fleet Sync; `url` is the v1 base without a trailing slash."""

    def poll(self, body: str) -> HttpResponse:
        return self._post(f'{self.url}/poll', body)

    def post_result(self, command_id: str, body: str) -> HttpResponse:
        return self._post(f'{self.url}/{uuid.UUID(command_id)}/results', body)


def commands_url_from_sync_url(sync_url: str) -> str:
    """The sibling Fleet Commands base of a Fleet Sync URL, so one setting serves both."""
    suffix = '/api/fleet/v1/sync'
    if not sync_url.endswith(suffix):
        raise ValueError('Set command_base_url: FLEET_SYNC_URL does not end with the Fleet Sync path')
    return sync_url[:-len(suffix)] + '/api/fleet/commands/v1'


def _header(headers: object, name: str) -> str | None:
    getter = getattr(headers, 'get', None)
    if getter is None:
        return None
    value = getter(name)
    return str(value) if value is not None else None
