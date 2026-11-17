"""Pydantic schemas shared by the orchestrator endpoints."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class SessionState(str, Enum):
    PENDING = "pending"
    PROVISIONING = "provisioning"
    INSTALLING = "installing"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    FAILED = "failed"


class DeviceProfile(str, Enum):
    PHONE = "phone"
    PHONE_XL = "phone-xl"
    TABLET = "tablet"


DEVICE_DIMENSIONS: dict[DeviceProfile, tuple[int, int, int]] = {
    DeviceProfile.PHONE: (1080, 2400, 420),
    DeviceProfile.PHONE_XL: (1440, 3120, 560),
    DeviceProfile.TABLET: (1600, 2560, 320),
}


class StartSessionRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)
    apk_url: HttpUrl | str = Field(description="Signed, single-use download URL.")
    apk_filename: str = Field(default="app.apk", max_length=180)
    package_name: str | None = None
    device_profile: DeviceProfile = DeviceProfile.PHONE
    # A signed-in user may run a device for as long as they like, so the ceiling
    # is a full day rather than an hour. The web layer sends 86400 for
    # lease-free sessions; demo/operator-levied sessions send their own TTL.
    ttl_seconds: int = Field(default=86400, ge=60, le=86400)


class StopSessionRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)


class SessionResponse(BaseModel):
    session_id: str
    state: SessionState
    container_id: str | None = None
    adb_port: int | None = None
    stream_url: str | None = None
    ws_url: str | None = None
    device_profile: DeviceProfile = DeviceProfile.PHONE
    expires_at: datetime | None = None
    simulated: bool = False
    message: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    docker: bool
    containers: int
    active_sessions: int
    reaper_interval: int
    version: str
