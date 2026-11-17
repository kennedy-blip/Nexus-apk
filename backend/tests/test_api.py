"""Orchestrator API tests — run without Docker by forcing simulator mode."""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("NEXUS_BACKEND_TOKEN", "test-token")
os.environ.setdefault("NEXUS_SIMULATE_WHEN_NO_DOCKER", "true")
os.environ.setdefault("NEXUS_REAPER_INTERVAL_SECONDS", "3600")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

AUTH = {"Authorization": "Bearer test-token"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_healthz_reports_state(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert "docker" in body


def test_start_requires_token(client):
    response = client.post(
        "/api/session/start",
        json={
            "session_id": "sess-unauthorised",
            "apk_url": "https://example.com/app.apk",
            "apk_filename": "app.apk",
        },
    )
    assert response.status_code == 401


def test_start_rejects_bad_token(client):
    response = client.post(
        "/api/session/start",
        headers={"Authorization": "Bearer nope"},
        json={
            "session_id": "sess-badtoken",
            "apk_url": "https://example.com/app.apk",
            "apk_filename": "app.apk",
        },
    )
    assert response.status_code == 403


def test_start_session_falls_back_to_simulator(client):
    response = client.post(
        "/api/session/start",
        headers=AUTH,
        json={
            "session_id": "sess-simulated",
            "apk_url": "https://example.com/app.apk",
            "apk_filename": "app.apk",
            "device_profile": "phone",
            "ttl_seconds": 600,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["session_id"] == "sess-simulated"
    assert body["state"] in {"running", "provisioning"}
    if body["simulated"]:
        assert body["stream_url"] is None


def test_get_session_roundtrip(client):
    client.post(
        "/api/session/start",
        headers=AUTH,
        json={
            "session_id": "sess-roundtrip",
            "apk_url": "https://example.com/app.apk",
            "apk_filename": "app.apk",
        },
    )
    response = client.get("/api/session/sess-roundtrip", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["session_id"] == "sess-roundtrip"


def test_heartbeat_extends_lease(client):
    client.post(
        "/api/session/start",
        headers=AUTH,
        json={
            "session_id": "sess-heartbeat",
            "apk_url": "https://example.com/app.apk",
            "apk_filename": "app.apk",
            "ttl_seconds": 120,
        },
    )
    response = client.post("/api/session/sess-heartbeat/heartbeat", headers=AUTH)
    assert response.status_code == 200


def test_stop_is_idempotent(client):
    client.post(
        "/api/session/start",
        headers=AUTH,
        json={
            "session_id": "sess-stop",
            "apk_url": "https://example.com/app.apk",
            "apk_filename": "app.apk",
        },
    )
    first = client.post("/api/session/stop", headers=AUTH, json={"session_id": "sess-stop"})
    assert first.status_code == 200
    assert first.json()["state"] == "stopped"

    second = client.post("/api/session/stop", headers=AUTH, json={"session_id": "sess-stop"})
    assert second.status_code == 200
    assert second.json()["state"] == "stopped"


def test_unknown_session_is_404(client):
    response = client.get("/api/session/does-not-exist", headers=AUTH)
    assert response.status_code == 404


def test_validation_rejects_short_id(client):
    response = client.post(
        "/api/session/start",
        headers=AUTH,
        json={"session_id": "x", "apk_url": "https://example.com/a.apk"},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# streaming bridge smoke tests (simulator sessions have no adb endpoint)
# ---------------------------------------------------------------------------
def test_stream_stats_conflicts_for_simulated(client):
    from app.security import issue_stream_token

    client.post(
        "/api/session/start",
        headers=AUTH,
        json={
            "session_id": "sess-streaming",
            "apk_url": "https://example.com/app.apk",
            "apk_filename": "app.apk",
        },
    )
    token = issue_stream_token("test-token", "sess-streaming", ttl_seconds=60)
    response = client.get(f"/api/stream/sess-streaming/stats?token={token}")
    assert response.status_code in {409, 404}


def test_stream_stats_requires_valid_token(client):
    response = client.get("/api/stream/sess-streaming/stats?token=bogus")
    assert response.status_code == 401
