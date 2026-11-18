"""Live device streaming: MJPEG frame pump + WebSocket input bridge.

Two transports, one contract:

  GET  /api/stream/{session_id}/mjpeg   multipart JPEG feed (browser <img>)
  WS   /api/stream/{session_id}/control JSON input frames -> adb

The client (`components/playground` + `hooks/use-device-stream`) already speaks
the normalised frame protocol; this module is the server half. MJPEG is used as
the universal fallback because it needs no encoder negotation, works through
proxies, and every browser can render it — WebRTC remains an optional upgrade
via `NEXUS_STREAM_MODE=webrtc`.

Frames are captured with `adb exec-out screencap -p`, which returns PNG. PNG
capture is ~80-150ms on a modest node, so the pump targets `NEXUS_STREAM_FPS`
(default 8) and hard-skips overlapping captures rather than queueing them: a
stale frame is worse than a dropped one for input fidelity.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from .adb import KEYCODE, AdbClient, AdbUnavailable
from .docker_service import DockerService
from .security import verify_stream_token

logger = logging.getLogger("nexus.stream")

BOUNDARY = "nexusframe"
MAX_TEXT = 64


class FramePump:
    """Captures JPEG/PNG frames for one session and fans them out to viewers.

    A single capture loop per session avoids the classic bug where N viewers
    each hammer adb; subscribers just receive the newest frame.
    """

    def __init__(self, session_id: str, client: AdbClient, fps: int = 8) -> None:
        self.session_id = session_id
        self.client = client
        self.fps = max(1, min(fps, 30))
        self._task: asyncio.Task | None = None
        self._subscribers: set[asyncio.Queue] = set()
        self._latest: bytes | None = None
        self._frames = 0
        self._last_error: str | None = None
        self._started_at = time.time()

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop(), name=f"pump-{self.session_id}")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    @property
    def stats(self) -> dict[str, Any]:
        uptime = max(0.001, time.time() - self._started_at)
        return {
            "frames": self._frames,
            "fps": round(self._frames / uptime, 1),
            "viewers": len(self._subscribers),
            "error": self._last_error,
        }

    # -- capture -----------------------------------------------------------
    async def _loop(self) -> None:
        interval = 1.0 / self.fps
        while True:
            started = time.perf_counter()
            try:
                png = await self.client.screencap()
                self._latest = png
                self._frames += 1
                self._last_error = None
                self._broadcast(png)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - device may still be booting
                self._last_error = str(exc)[:200]
                logger.debug("capture failed for %s: %s", self.session_id, exc)

            # Pace to the target fps, accounting for capture cost.
            elapsed = time.perf_counter() - started
            await asyncio.sleep(max(0.0, interval - elapsed))

    def _broadcast(self, frame: bytes) -> None:
        for queue in list(self._subscribers):
            if queue.full():
                # Drop the oldest so viewers track "now" rather than lag.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(frame)
            except asyncio.QueueFull:
                pass

    # -- consumption -------------------------------------------------------
    async def frames(self):
        """Async generator of multipart JPEG parts for one viewer."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=1)
        self._subscribers.add(queue)
        try:
            # Prime with the last frame so a viewer never waits a full cycle.
            if self._latest:
                queue.put_nowait(self._latest)
            while True:
                frame = await queue.get()
                yield (
                    f"--{BOUNDARY}\r\n"
                    "Content-Type: image/png\r\n"
                    f"Content-Length: {len(frame)}\r\n\r\n"
                ).encode() + frame + b"\r\n"
        finally:
            self._subscribers.discard(queue)


class StreamRegistry:
    """Owns one FramePump per live session."""

    def __init__(self, service: DockerService, fps: int = 8) -> None:
        self.service = service
        self.fps = fps
        self._pumps: dict[str, FramePump] = {}

    def pump_for(self, session_id: str) -> FramePump | None:
        session = self.service.get(session_id)
        if session is None or session.simulated or not session.adb_port:
            return None

        pump = self._pumps.get(session_id)
        if pump is None:
            pump = FramePump(
                session_id,
                AdbClient(serial=f"127.0.0.1:{session.adb_port}"),
                fps=self.fps,
            )
            pump.start()
            self._pumps[session_id] = pump
            logger.info("frame pump started for %s", session_id)
        return pump

    async def drop(self, session_id: str) -> None:
        pump = self._pumps.pop(session_id, None)
        if pump:
            await pump.stop()
            logger.info("frame pump stopped for %s", session_id)

    async def close(self) -> None:
        for session_id in list(self._pumps):
            await self.drop(session_id)


def build_router(service: DockerService, registry: StreamRegistry) -> APIRouter:
    router = APIRouter(prefix="/api/stream", tags=["streaming"])

    def _authorise(session_id: str, token: str | None) -> None:
        if not verify_stream_token(service.settings.backend_token, session_id, token):
            raise HTTPException(status_code=401, detail="invalid or expired stream token")

    def _client_for(session_id: str) -> tuple[AdbClient, Any]:
        session = service.get(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="session not found")
        if session.simulated or not session.adb_port:
            raise HTTPException(
                status_code=409,
                detail="session has no container; use the browser simulator",
            )
        return AdbClient(serial=f"127.0.0.1:{session.adb_port}"), session

    @router.get("/{session_id}/mjpeg")
    async def mjpeg(session_id: str, token: str | None = Query(default=None)) -> StreamingResponse:
        _authorise(session_id, token)
        pump = registry.pump_for(session_id)
        if pump is None:
            raise HTTPException(status_code=409, detail="no streamable session")
        return StreamingResponse(
            pump.frames(),
            media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
            headers={
                "cache-control": "no-store, no-cache, must-revalidate",
                "x-accel-buffering": "no",
                "connection": "keep-alive",
            },
        )

    @router.get("/{session_id}/stats")
    async def stats(session_id: str, token: str | None = Query(default=None)) -> dict[str, Any]:
        _authorise(session_id, token)
        pump = registry.pump_for(session_id)
        if pump is None:
            raise HTTPException(status_code=409, detail="no streamable session")
        return pump.stats

    @router.post("/{session_id}/input")
    async def input_frame(
        session_id: str,
        frame: dict,
        token: str | None = Query(default=None),
    ) -> dict[str, Any]:
        """HTTP fallback for the control channel.

        Used when the browser reaches the orchestrator through a layer that
        cannot proxy WebSocket upgrades (e.g. Next.js route handlers).
        """
        _authorise(session_id, token)
        client, session = _client_for(session_id)
        width, height = await client.display_size()
        try:
            await _apply(client, frame, width, height, session)
        except AdbUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"ok": True}

    @router.websocket("/{session_id}/control")
    async def control(websocket: WebSocket, session_id: str, token: str | None = None) -> None:
        await websocket.accept()

        if not verify_stream_token(service.settings.backend_token, session_id, token):
            await websocket.send_json({"type": "error", "detail": "invalid stream token"})
            await websocket.close(code=1008)
            return

        try:
            client, session = _client_for(session_id)
        except HTTPException as exc:
            await websocket.send_json({"type": "error", "detail": exc.detail})
            await websocket.close(code=1008)
            return

        width, height = await client.display_size()
        await websocket.send_json(
            {"type": "ready", "width": width, "height": height, "session_id": session_id}
        )

        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    frame = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                try:
                    await _apply(client, frame, width, height, session)
                except AdbUnavailable as exc:
                    await websocket.send_json({"type": "error", "detail": str(exc)})
        except WebSocketDisconnect:
            logger.debug("control client left %s", session_id)

    return router


async def _apply(client: AdbClient, frame: dict, width: int, height: int, session) -> None:
    """Translate one protocol frame into adb input primitives."""

    kind = frame.get("type")

    def px(value: Any, axis: int) -> int:
        try:
            return int(round(float(value) * (width if axis == 0 else height)))
        except (TypeError, ValueError):
            return 0

    if kind == "touch":
        # `input tap` covers down->up; intermediate move frames are ignored
        # because adb has no streaming touch API without an instrumentation app.
        if frame.get("action") == "up":
            await client.tap(px(frame.get("x"), 0), px(frame.get("y"), 1))

    elif kind == "swipe":
        await client.swipe(
            px(frame.get("x1"), 0),
            px(frame.get("y1"), 1),
            px(frame.get("x2"), 0),
            px(frame.get("y2"), 1),
            int(frame.get("duration", 200)),
        )

    elif kind == "key":
        if (text := frame.get("text")) is not None:
            await client.text(str(text)[:MAX_TEXT])
        elif (keycode := frame.get("keyCode")) is not None:
            await client.keyevent(int(keycode))

    elif kind == "command":
        action = frame.get("action")
        if action in KEYCODE:
            await client.keyevent(KEYCODE[action])
        elif action == "rotate":
            await client.shell("settings put system accelerometer_rotation 0")
            await client.shell("settings put system user_rotation 1")
        elif action in {"screenshot"}:
            # capture is served by the MJPEG/stats path; nothing to do here
            return
