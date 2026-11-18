"""Thin ADB client used by provisioning and the live input bridge.

Every session owns one adb endpoint (`127.0.0.1:<mapped_port>`). Commands are
serialised per device because `adb shell input` calls are not safe to interleave
and adb's own server serialises them anyway.

The client is intentionally synchronous at the subprocess level and wrapped by
`asyncio.to_thread` at call sites: it keeps the code tiny, and adb calls are
short-lived (tens of milliseconds).
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from dataclasses import dataclass

logger = logging.getLogger("nexus.adb")

# Android keycodes used by the workspace toolbar / keyboard bridge.
KEYCODE = {
    "home": 3,
    "back": 4,
    "power": 26,
    "volume-up": 24,
    "volume-down": 25,
    "recents": 187,
    "enter": 66,
    "del": 67,
    "tab": 61,
    "menu": 82,
}


class AdbUnavailable(RuntimeError):
    """Raised when the adb binary is missing or the device is unreachable."""


def adb_path() -> str:
    binary = shutil.which("adb")
    if binary is None:
        raise AdbUnavailable("adb binary not found on PATH")
    return binary


@dataclass
class AdbClient:
    """Talks to a single device endpoint."""

    serial: str
    timeout: float = 60.0

    def __post_init__(self) -> None:
        self._lock = asyncio.Lock()

    # -- raw ------------------------------------------------------------
    async def _run(self, args: list[str], timeout: float | None = None) -> tuple[int, bytes]:
        try:
            binary = adb_path()
        except AdbUnavailable:
            raise

        proc = await asyncio.create_subprocess_exec(
            binary,
            "-s",
            self.serial,
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            stdout, _ = await asyncio.wait_for(
                proc.communicate(), timeout=timeout or self.timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise AdbUnavailable(f"adb {' '.join(args[:2])} timed out") from None

        return proc.returncode or 0, stdout or b""

    async def run(self, *args: str, timeout: float | None = None) -> tuple[int, bytes]:
        async with self._lock:
            return await self._run(list(args), timeout)

    async def shell(self, command: str, timeout: float | None = None) -> tuple[int, bytes]:
        return await self.run("shell", command, timeout=timeout)

    async def exec_out(self, *args: str, timeout: float | None = None) -> bytes:
        """Binary-safe read (screencap, etc)."""
        code, out = await self.run("exec-out", *args, timeout=timeout)
        if code != 0:
            raise AdbUnavailable(f"exec-out {' '.join(args)} failed: {out[:200]!r}")
        return out

    # -- device state ----------------------------------------------------
    async def is_online(self) -> bool:
        try:
            code, out = await self.run("get-state", timeout=5)
            return code == 0 and b"device" in out
        except AdbUnavailable:
            return False

    async def boot_completed(self) -> bool:
        try:
            code, out = await self.shell("getprop sys.boot_completed", timeout=10)
            return code == 0 and out.strip() == b"1"
        except AdbUnavailable:
            return False

    async def install(self, apk_path: str) -> tuple[int, bytes]:
        return await self.run("install", "-r", "-t", apk_path, timeout=300)

    # -- input primitives -------------------------------------------------
    async def tap(self, x: int, y: int) -> None:
        await self.shell(f"input tap {x} {y}")

    async def swipe(self, x1: int, y1: int, x2: int, y2: int, duration_ms: int) -> None:
        await self.shell(
            f"input swipe {x1} {y1} {x2} {y2} {max(1, duration_ms)}"
        )

    async def keyevent(self, keycode: int) -> None:
        await self.shell(f"input keyevent {keycode}")

    async def text(self, value: str) -> None:
        # `input text` treats %s as space and does not accept raw shell
        # metacharacters; escape the ones that matter for a shell string.
        escaped = (
            value.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace(" ", "%s")
            .replace("&", "\\&")
            .replace("<", "\\<")
            .replace(">", "\\>")
            .replace(";", "\\;")
            .replace("|", "\\|")
            .replace("(", "\\(")
            .replace(")", "\\)")
        )
        if not escaped:
            return
        await self.shell(f"input text '{escaped}'")

    async def screencap(self, timeout: float = 20.0) -> bytes:
        """PNG screenshot of the current display."""
        return await self.exec_out("screencap", "-p", timeout=timeout)

    async def display_size(self) -> tuple[int, int]:
        """Current logical display size, used to map normalised input."""
        try:
            _, out = await self.shell("wm size")
            # "Physical size: 1080x2400" / "Override size: 720x1600"
            last = out.decode(errors="ignore").strip().splitlines()[-1]
            dims = last.split(":")[-1].strip().split("x")
            return int(dims[0]), int(dims[1])
        except Exception:  # noqa: BLE001 - fall back to config default
            return 1080, 2400

    async def launch_package(self, package: str) -> None:
        await self.shell(
            f"monkey -p {package} -c android.intent.category.LAUNCHER 1"
        )
