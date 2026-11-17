"""Short-lived signed tokens for header-less transports.

MJPEG `<img>` tags and browser WebSocket handshakes cannot send an
`Authorization` header, so the control plane mints an HMAC token bound to a
single session id + expiry. Tokens are stateless and verified with a constant
time comparison.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

DEFAULT_TTL_SECONDS = 300


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(secret: str, payload: str) -> str:
    digest = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    return _b64(digest)


def issue_stream_token(
    secret: str, session_id: str, ttl_seconds: int = DEFAULT_TTL_SECONDS
) -> str:
    payload = {"sid": session_id, "exp": int(time.time()) + ttl_seconds}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{body}.{_sign(secret, body)}"


def verify_stream_token(secret: str, session_id: str, token: str | None) -> bool:
    if not secret:
        # No shared secret configured: the service already runs unauthenticated.
        return True
    if not token or "." not in token:
        return False

    body, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(signature, _sign(secret, body)):
        return False

    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return False

    if payload.get("sid") != session_id:
        return False

    return int(payload.get("exp", 0)) >= int(time.time())
