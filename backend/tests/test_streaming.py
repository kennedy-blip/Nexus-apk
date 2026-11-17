"""Streaming bridge: token auth, protocol translation, MJPEG framing."""

from __future__ import annotations

import asyncio
import os

import pytest

os.environ.setdefault("NEXUS_BACKEND_TOKEN", "test-token")
os.environ.setdefault("NEXUS_SIMULATE_WHEN_NO_DOCKER", "true")
os.environ.setdefault("NEXUS_REAPER_INTERVAL_SECONDS", "3600")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.security import issue_stream_token, verify_stream_token  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_token_roundtrip():
    token = issue_stream_token("test-token", "sess-abc", ttl_seconds=60)
    assert verify_stream_token("test-token", "sess-abc", token)


def test_token_rejects_other_session():
    token = issue_stream_token("test-token", "sess-abc", ttl_seconds=60)
    assert not verify_stream_token("test-token", "sess-xyz", token)


def test_token_rejects_wrong_secret():
    token = issue_stream_token("other-secret", "sess-abc", ttl_seconds=60)
    assert not verify_stream_token("test-token", "sess-abc", token)


def test_token_rejects_expired():
    token = issue_stream_token("test-token", "sess-abc", ttl_seconds=-5)
    assert not verify_stream_token("test-token", "sess-abc", token)


def test_token_rejects_garbage():
    assert not verify_stream_token("test-token", "sess-abc", "nope")
    assert not verify_stream_token("test-token", "sess-abc", None)


def test_token_is_noop_without_secret():
    assert verify_stream_token("", "sess-abc", None)


class _FakeAdb:
    def __init__(self) -> None:
        self.calls: list[tuple[str, ...]] = []

    async def tap(self, x, y):
        self.calls.append(("tap", x, y))

    async def swipe(self, x1, y1, x2, y2, duration):
        self.calls.append(("swipe", x1, y1, x2, y2, duration))

    async def keyevent(self, code):
        self.calls.append(("key", code))

    async def text(self, value):
        self.calls.append(("text", value))

    async def shell(self, command):
        self.calls.append(("shell", command))


@pytest.mark.asyncio
async def test_normalised_touch_becomes_pixel_tap():
    from app.streaming import _apply

    adb = _FakeAdb()
    await _apply(adb, {"type": "touch", "action": "up", "x": 0.5, "y": 0.25}, 1000, 2000, None)
    assert adb.calls == [("tap", 500, 500)]


@pytest.mark.asyncio
async def test_down_frame_is_ignored():
    from app.streaming import _apply

    adb = _FakeAdb()
    await _apply(adb, {"type": "touch", "action": "down", "x": 0.1, "y": 0.1}, 1000, 2000, None)
    assert adb.calls == []


@pytest.mark.asyncio
async def test_swipe_and_key_and_command():
    from app.streaming import _apply

    adb = _FakeAdb()
    await _apply(
        adb,
        {"type": "swipe", "x1": 0, "y1": 0.9, "x2": 0, "y2": 0.1, "duration": 240},
        1080,
        2400,
        None,
    )
    await _apply(adb, {"type": "key", "text": "hello"}, 1080, 2400, None)
    await _apply(adb, {"type": "key", "keyCode": 66}, 1080, 2400, None)
    await _apply(adb, {"type": "command", "action": "home"}, 1080, 2400, None)

    assert adb.calls[0] == ("swipe", 0, 2160, 0, 240, 240)
    assert adb.calls[1] == ("text", "hello")
    assert adb.calls[2] == ("key", 66)
    assert adb.calls[3] == ("key", 3)


@pytest.mark.asyncio
async def test_out_of_range_coordinates_are_clamped_by_cast():
    from app.streaming import _apply

    adb = _FakeAdb()
    await _apply(adb, {"type": "touch", "action": "up", "x": "not-a-number", "y": 1}, 10, 10, None)
    assert adb.calls == [("tap", 0, 10)]


def test_mjpeg_requires_token(client):
    response = client.get("/api/stream/sess-anything/mjpeg")
    assert response.status_code == 401


def test_mjpeg_rejects_bad_token(client):
    response = client.get("/api/stream/sess-anything/mjpeg?token=zzz")
    assert response.status_code == 401


def test_mjpeg_conflicts_without_container(client):
    token = issue_stream_token("test-token", "sess-mjpeg", ttl_seconds=60)
    response = client.get(f"/api/stream/sess-mjpeg/mjpeg?token={token}")
    assert response.status_code in {409, 404}
