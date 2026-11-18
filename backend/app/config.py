"""Runtime configuration for the NexusAPK orchestrator."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven settings (prefix: NEXUS_)."""

    model_config = SettingsConfigDict(
        env_prefix="NEXUS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- security -------------------------------------------------------
    backend_token: str = Field(
        default="",
        description="Shared bearer token the Next.js control plane presents.",
    )

    # --- docker ---------------------------------------------------------
    docker_host: str | None = Field(default=None, description="e.g. unix:///var/run/docker.sock")
    redroid_image: str = "redroid/redroid:13.0.0_64only-latest"
    container_prefix: str = "nexus-redroid"
    container_network: str | None = None
    # Port range handed out for ADB (one per session).
    adb_port_start: int = 5555
    adb_port_end: int = 5699

    # --- device ---------------------------------------------------------
    device_width: int = 1080
    device_height: int = 2400
    device_dpi: int = 420
    device_fps: int = 60

    # --- lifecycle ------------------------------------------------------
    # 0 means "no lease": signed-in sessions stay up until the user stops them.
    # Set a positive value only when you want a hard capacity cap.
    session_ttl_seconds: int = 86400
    idle_timeout_seconds: int = 1800
    max_concurrent_sessions: int = 8
    boot_timeout_seconds: int = 180
    install_timeout_seconds: int = 180
    reaper_interval_seconds: int = 30

    # --- streaming ------------------------------------------------------
    # Public base URL of *this* service as reachable from the browser, used to
    # build the per-session MJPEG + WebSocket endpoints. Leave empty to derive
    # from the incoming request host (set it behind a proxy/tunnel).
    stream_public_base: str | None = None
    # Frames per second for the MJPEG pump (screencap-bound, 8 is a good mix).
    stream_fps: int = 8
    # Optional external scrcpy/WebRTC bridge for low-latency upgrades.
    scrcpy_ws_base: str | None = None
    webrtc_base: str | None = None

    # --- storage --------------------------------------------------------
    tmp_dir: str = "/tmp/nexus-sessions"
    apk_download_timeout: int = 300

    # --- behaviour ------------------------------------------------------
    simulate_when_no_docker: bool = True
    allow_origin: str = "*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
