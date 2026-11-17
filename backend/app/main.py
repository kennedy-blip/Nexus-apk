"""NexusAPK orchestrator — FastAPI service managing redroid container sessions.

Run locally:

    uvicorn app.main:app --reload --port 8000

Endpoints (all except /healthz require `Authorization: Bearer $NEXUS_BACKEND_TOKEN`):

    POST /api/session/start        spawn a container and side-load the APK
    GET  /api/session/{id}         session status + streaming endpoints
    POST /api/session/{id}/heartbeat  extend the lease
    POST /api/session/stop         destroy the container
    GET  /api/sessions             list active sessions
    GET  /healthz                  docker/session readiness
"""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .docker_service import (
    DockerService,
    DockerUnavailable,
    PortExhausted,
    SessionLimitReached,
)
from .models import (
    HealthResponse,
    SessionResponse,
    SessionState,
    StartSessionRequest,
    StopSessionRequest,
)

VERSION = "1.0.0"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s :: %(message)s",
)
logger = logging.getLogger("nexus")

service: DockerService | None = None


# ---------------------------------------------------------------------------
# lifespan: background reaper
# ---------------------------------------------------------------------------
async def _reaper_loop(app: FastAPI, settings: Settings) -> None:
    assert service is not None
    while True:
        await asyncio.sleep(settings.reaper_interval_seconds)
        try:
            reaped = await service.reap_expired()
            # Containers whose lease lapsed without a registry entry are also
            # swept here (e.g. after an orchestrator restart).
            if reaped:
                logger.info("reaped %s expired session(s)", reaped)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("reaper iteration failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global service
    settings = get_settings()
    service = DockerService(settings)

    if not settings.backend_token:
        logger.warning(
            "NEXUS_BACKEND_TOKEN is empty - the API is running unauthenticated. "
            "Set a token before exposing this service."
        )
    if not service.docker_available():
        logger.warning("docker daemon unavailable - sessions will use the simulator")

    task = asyncio.create_task(_reaper_loop(app, settings))
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        # Graceful teardown so no orphaned containers survive a deploy.
        if service is not None:
            for session_id in list(service.sessions):
                with contextlib.suppress(Exception):
                    await service.stop(session_id)


def get_service() -> DockerService:
    if service is None:  # pragma: no cover - only before startup
        raise HTTPException(status_code=503, detail="orchestrator not ready")
    return service


async def require_token(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Constant-time bearer token check (no-op when no token is configured)."""
    if not settings.backend_token:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    presented = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(presented, settings.backend_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="invalid token"
        )


# ---------------------------------------------------------------------------
# app
# ---------------------------------------------------------------------------
settings = get_settings()

app = FastAPI(
    title="NexusAPK Orchestrator",
    version=VERSION,
    description="Container lifecycle API for cloud Android APK streaming.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.allow_origin] if settings.allow_origin != "*" else ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["authorization", "content-type"],
)


def _serialise(session, settings: Settings) -> SessionResponse:
    stream_url, ws_url = service.streaming_urls(session) if service else (None, None)
    return SessionResponse(
        session_id=session.session_id,
        state=session.state,
        container_id=session.container_id,
        adb_port=session.adb_port,
        stream_url=stream_url,
        ws_url=ws_url,
        device_profile=session.device_profile,
        expires_at=session.expires_at,
        simulated=session.simulated,
        message=session.error,
    )


@app.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    svc = get_service()
    docker_ok = svc.docker_available()
    return HealthResponse(
        status="ok" if docker_ok else "degraded",
        docker=docker_ok,
        containers=svc.active_container_count(),
        active_sessions=len(svc.sessions),
        reaper_interval=svc.settings.reaper_interval_seconds,
        version=VERSION,
    )


@app.post(
    "/api/session/start",
    response_model=SessionResponse,
    dependencies=[Depends(require_token)],
)
async def start_session(request: StartSessionRequest) -> SessionResponse:
    svc = get_service()
    try:
        session = await svc.start(request)
    except SessionLimitReached as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except PortExhausted as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except DockerUnavailable as exc:
        raise HTTPException(
            status_code=503, detail=f"docker unavailable: {exc}"
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("session start failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    logger.info("session %s -> %s", session.session_id, session.state.value)
    return _serialise(session, svc.settings)


@app.get(
    "/api/session/{session_id}",
    response_model=SessionResponse,
    dependencies=[Depends(require_token)],
)
async def get_session(session_id: str) -> SessionResponse:
    svc = get_service()
    session = svc.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return _serialise(session, svc.settings)


@app.post(
    "/api/session/{session_id}/heartbeat",
    response_model=SessionResponse,
    dependencies=[Depends(require_token)],
)
async def heartbeat(session_id: str) -> SessionResponse:
    svc = get_service()
    session = svc.heartbeat(session_id, svc.settings.session_ttl_seconds)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return _serialise(session, svc.settings)


@app.post(
    "/api/session/stop",
    response_model=SessionResponse,
    dependencies=[Depends(require_token)],
)
async def stop_session(request: StopSessionRequest) -> SessionResponse:
    svc = get_service()
    session = svc.get(request.session_id)
    if session is None:
        # Idempotent teardown of a session the registry may have forgotten.
        await svc.stop(request.session_id)
        return SessionResponse(
            session_id=request.session_id,
            state=SessionState.STOPPED,
            message="no active session; teardown attempted",
        )

    await svc.stop(request.session_id)
    session.state = SessionState.STOPPED
    session.expires_at = datetime.now(timezone.utc)
    return _serialise(session, svc.settings)


@app.get(
    "/api/sessions",
    response_model=list[SessionResponse],
    dependencies=[Depends(require_token)],
)
async def list_sessions() -> list[SessionResponse]:
    svc = get_service()
    return [_serialise(s, svc.settings) for s in svc.sessions.values()]
