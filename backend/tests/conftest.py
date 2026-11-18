"""Shared test environment.

These tests exercise the *control plane*, not real Android containers. They
must therefore never reach a live Docker daemon:

- On a developer machine Docker is usually absent, so sessions fall back to
  the simulator and everything is fast.
- On a GitHub Actions runner Docker **is** present, so the same tests would
  provision a real privileged redroid container (a multi-gigabyte image pull)
  and hang the job indefinitely.

Pointing the client at an unroutable Docker endpoint makes the simulator path
deterministic on every host. The connection is refused immediately, so the
suite stays fast instead of waiting on a socket.
"""

from __future__ import annotations

import os

# Must be set before `app.config` is imported, because settings are cached.
os.environ["NEXUS_DOCKER_HOST"] = "unix:///nonexistent/nexus-ci-docker.sock"
os.environ["NEXUS_SIMULATE_WHEN_NO_DOCKER"] = "true"
os.environ.setdefault("NEXUS_BACKEND_TOKEN", "test-token")
