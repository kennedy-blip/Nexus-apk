"""Docker container lifecycle for redroid Android sessions.

A *session* maps 1:1 to a redroid container:

    redroid/redroid:13.0.0_64only-latest
        --privileged --memory 6g --cpus 4
        androidboot.redroid_width=1080
        androidboot.redroid_height=2400
        androidboot.redroid_dpi=420
        androidboot.redroid_fps=60
        -p <host_adb>:5555

APKs are side-loaded with `adb install` through the mapped port rather than
baked into the image, which keeps cold starts short and containers immutable.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import socket
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from .config import Settings
from .models import DEVICE_DIMENSIONS, DeviceProfile, SessionState

logger = logging.getLogger("nexus.docker")


@dataclass
class Session:
    """In-memory session registry entry (the source of truth is Postgres)."""

    session_id: str
    apk_url: str
    apk_filename: str
    package_name: str | None
    device_profile: DeviceProfile
    state: SessionState = SessionState.PENDING
    container_id: str | None = None
    adb_port: int | None = None
    sim_ports: list[int] = field(default_factory=list)
    work_dir: Path | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(minutes=15)
    )
    last_touch: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    simulated: bool = False

    @property
    def expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at

    def touch(self, ttl_seconds: int) -> None:
        now = datetime.now(timezone.utc)
        self.last_touch = now
        self.expires_at = now + timedelta(seconds=ttl_seconds)


class DockerUnavailable(RuntimeError):
    pass


class PortExhausted(RuntimeError):
    pass


class SessionLimitReached(RuntimeError):
    pass


def _port_free(port: int, host: str = "127.0.0.1") -> bool:
    """True when nothing is listening on `port` locally."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
            return True
        except OSError:
            return False


class DockerService:
    """Wraps the Docker SDK with async-friendly helpers and a session registry."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.sessions: dict[str, Session] = {}
        self._client: Any | None = None
        self._lock = asyncio.Lock()
        Path(settings.tmp_dir).mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # docker plumbing
    # ------------------------------------------------------------------
    @property
    def client(self):
        if self._client is None:
            try:
                import docker  # imported lazily so tests can stub it

                self._client = (
                    docker.DockerClient(base_url=self.settings.docker_host)
                    if self.settings.docker_host
                    else docker.from_env()
                )
                self._client.ping()
            except Exception as exc:  # noqa: BLE001 - surfaced as availability
                self._client = None
                raise DockerUnavailable(str(exc)) from exc
        return self._client

    def docker_available(self) -> bool:
        try:
            self.client.ping()
            return True
        except Exception:  # noqa: BLE001
            return False

    def active_container_count(self) -> int:
        try:
            return len(
                self.client.containers.list(
                    filters={"name": self.settings.container_prefix}
                )
            )
        except Exception:  # noqa: BLE001
            return 0

    # ------------------------------------------------------------------
    # session lifecycle
    # ------------------------------------------------------------------
    async def start(self, request) -> Session:
        async with self._lock:
            if len(self.sessions) >= self.settings.max_concurrent_sessions:
                # Opportunistically reclaim an expired slot before rejecting.
                await self._reap_expired_locked()
                if len(self.sessions) >= self.settings.max_concurrent_sessions:
                    raise SessionLimitReached(
                        f"max {self.settings.max_concurrent_sessions} concurrent sessions"
                    )

            existing = self.sessions.get(request.session_id)
            if existing and existing.state is SessionState.RUNNING:
                existing.touch(request.ttl_seconds)
                return existing

            session = Session(
                session_id=request.session_id,
                apk_url=str(request.apk_url),
                apk_filename=request.apk_filename,
                package_name=request.package_name,
                device_profile=request.device_profile,
                expires_at=datetime.now(timezone.utc)
                + timedelta(seconds=request.ttl_seconds),
            )
            self.sessions[session.session_id] = session

            if not self.docker_available():
                if self.settings.simulate_when_no_docker:
                    logger.warning(
                        "docker unavailable - session %s runs on the browser simulator",
                        session.session_id,
                    )
                    session.simulated = True
                    session.state = SessionState.RUNNING
                    session.error = "docker unavailable"
                    return session
                session.state = SessionState.FAILED
                session.error = "docker unavailable"
                raise DockerUnavailable("docker daemon unreachable")

            try:
                await self._provision(session)
            except Exception as exc:  # noqa: BLE001
                session.state = SessionState.FAILED
                session.error = str(exc)
                await self._destroy_container(session)
                raise

            return session

    async def _provision(self, session: Session) -> None:
        settings = self.settings
        session.state = SessionState.PROVISIONING

        width, height, dpi = DEVICE_DIMENSIONS[session.device_profile]
        adb_port = self._allocate_port()
        session.adb_port = adb_port

        name = f"{settings.container_prefix}-{session.session_id[:12]}"
        command = [
            f"androidboot.redroid_width={width}",
            f"androidboot.redroid_height={height}",
            f"androidboot.redroid_dpi={dpi}",
            f"androidboot.redroid_fps={settings.device_fps}",
            "androidboot.redroid_gpu_mode=guest",
            "androidboot.use_memfd=true",
        ]

        logger.info("starting %s on adb port %s", name, adb_port)

        container = await asyncio.to_thread(
            self.client.containers.run,
            settings.redroid_image,
            command=command,
            name=name,
            detach=True,
            privileged=True,
            remove=False,
            mem_limit="6g",
            nano_cpus=4_000_000_000,  # 4 vCPU
            shm_size="2g",
            ports={"5555/tcp": adb_port},
            volumes={
                "/dev/binderfs": {"bind": "/dev/binderfs", "mode": "rw"},
            }
            if Path("/dev/binderfs").exists()
            else None,
            network=settings.container_network,
            labels={
                "app": "nexusapk",
                "session_id": session.session_id,
                "managed_by": "nexus-orchestrator",
            },
        )

        session.container_id = container.id

        await self._wait_for_adb(session)
        session.state = SessionState.INSTALLING
        await self._install_apk(session)
        session.state = SessionState.RUNNING
        session.touch(settings.session_ttl_seconds)

    async def _wait_for_adb(self, session: Session) -> None:
        """Poll `adb shell getprop` until the redroid image is fully booted."""
        deadline = (
            datetime.now(timezone.utc)
            + timedelta(seconds=self.settings.boot_timeout_seconds)
        )
        while datetime.now(timezone.utc) < deadline:
            try:
                code, _ = await self._adb(session, ["shell", "getprop", "sys.boot_completed"])
                if code == 0:
                    return
            except Exception:  # noqa: BLE001 - container still starting
                pass
            await asyncio.sleep(3)
        raise TimeoutError("device did not finish booting in time")

    async def _install_apk(self, session: Session) -> None:
        """Download the signed APK into the session work dir and adb-install it."""
        work = Path(self.settings.tmp_dir) / session.session_id
        work.mkdir(parents=True, exist_ok=True)
        session.work_dir = work
        target = work / Path(session.apk_filename).name

        async with httpx.AsyncClient(
            timeout=self.settings.apk_download_timeout, follow_redirects=True
        ) as http:
            async with http.stream("GET", session.apk_url) as response:
                response.raise_for_status()
                with target.open("wb") as handle:
                    async for chunk in response.aiter_bytes(1 << 20):
                        handle.write(chunk)

        deadline = (
            datetime.now(timezone.utc)
            + timedelta(seconds=self.settings.install_timeout_seconds)
        )
        while datetime.now(timezone.utc) < deadline:
            code, output = await self._adb(
                session, ["install", "-r", "-t", str(target)]
            )
            if code == 0:
                logger.info("installed %s on %s", target.name, session.session_id)
                target.unlink(missing_ok=True)
                return
            if b"INSTALL_FAILED_ALREADY_EXISTS" in output:
                return
            await asyncio.sleep(4)

        raise TimeoutError(f"apk install failed: {output[-400:]!r}")

    async def _adb(self, session: Session, args: list[str]) -> tuple[int, bytes]:
        """Runs adb against the session's mapped port.

        Uses the docker exec'd adb client inside a sidecar if available;
        otherwise relies on a host `adb` binary connecting over TCP.
        """
        adb = shutil.which("adb")
        if adb is None:
            raise RuntimeError("adb binary not available on the orchestrator host")

        proc = await asyncio.create_subprocess_exec(
            adb,
            "-s",
            f"127.0.0.1:{session.adb_port}",
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
        return proc.returncode or 0, stdout

    def _allocate_port(self) -> int:
        for port in range(self.settings.adb_port_start, self.settings.adb_port_end + 1):
            if port in {s.adb_port for s in self.sessions.values()}:
                continue
            if _port_free(port):
                return port
        raise PortExhausted("no free ADB ports in the configured range")

    # ------------------------------------------------------------------
    # teardown
    # ------------------------------------------------------------------
    async def stop(self, session_id: str) -> Session | None:
        async with self._lock:
            session = self.sessions.get(session_id)
            if session is None:
                # Best effort: a container may exist for an unknown session.
                await self._destroy_by_label(session_id)
                return None

            session.state = SessionState.STOPPING
            await self._destroy_container(session)
            session.state = SessionState.STOPPED
            self.sessions.pop(session_id, None)
            return session

    async def _destroy_container(self, session: Session) -> None:
        if session.work_dir and session.work_dir.exists():
            await asyncio.to_thread(shutil.rmtree, session.work_dir, True)

        if not session.container_id:
            return
        try:
            container = self.client.containers.get(session.container_id)
            await asyncio.to_thread(container.remove, force=True, v=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("container teardown for %s: %s", session.session_id, exc)

    async def _destroy_by_label(self, session_id: str) -> None:
        try:
            for container in self.client.containers.list(
                all=True, filters={"label": f"session_id={session_id}"}
            ):
                await asyncio.to_thread(container.remove, force=True, v=True)
        except Exception:  # noqa: BLE001
            pass

    async def _reap_expired_locked(self) -> int:
        expired = [s for s in self.sessions.values() if s.expired]
        for session in expired:
            logger.info("reaping expired session %s", session.session_id)
            session.state = SessionState.STOPPING
            await self._destroy_container(session)
            self.sessions.pop(session.session_id, None)
        return len(expired)

    async def reap_expired(self) -> int:
        """Called by the background reaper loop."""
        async with self._lock:
            return await self._reap_expired_locked()

    # ------------------------------------------------------------------
    # queries
    # ------------------------------------------------------------------
    def get(self, session_id: str) -> Session | None:
        return self.sessions.get(session_id)

    def heartbeat(self, session_id: str, ttl_seconds: int) -> Session | None:
        session = self.sessions.get(session_id)
        if session:
            session.touch(ttl_seconds)
        return session

    def streaming_urls(
        self,
        session: Session,
        public_base: str | None = None,
        token: str | None = None,
    ) -> tuple[str | None, str | None]:
        """Returns (frame_stream_url, control_socket_url) for the browser.

        Prefers this service's own MJPEG + WebSocket bridge; an external
        scrcpy/WebRTC endpoint wins when explicitly configured. A short-lived
        signed token is appended because <img> and WebSocket handshakes cannot
        carry an Authorization header.
        """
        if session.simulated or session.adb_port is None:
            return None, None

        query = f"?token={token}" if token else ""

        base = (self.settings.stream_public_base or public_base or "").rstrip("/")
        stream = f"{base}/api/stream/{session.session_id}/mjpeg{query}" if base else None

        if self.settings.webrtc_base:
            stream = (
                f"{self.settings.webrtc_base.rstrip('/')}/stream/"
                f"{session.session_id}{query}"
            )

        ws = None
        if base:
            scheme = "wss" if base.startswith("https") else "ws"
            host = base.split("://", 1)[-1]
            ws = f"{scheme}://{host}/api/stream/{session.session_id}/control{query}"

        if self.settings.scrcpy_ws_base and session.container_id:
            ws = (
                f"{self.settings.scrcpy_ws_base.rstrip('/')}/"
                f"{session.container_id[:12]}{query}"
            )

        return stream, ws
