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
    session_ttl_seconds: int = 900
    idle_timeout_seconds: int = 900
    max_concurrent_sessions: int = 8
    boot_timeout_seconds: int = 180
    install_timeout_seconds: int = 180
    reaper_interval_seconds: int = 30

    # --- streaming ------------------------------------------------------
    # Base URL of the ws-scrcpy bridge (per-session path is appended).
    scrcpy_ws_base: str | None = None
    # Base URL the browser should use for the WebRTC signalling endpoint.
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
