# ---------------------------------------------------------------------------
# NexusAPK orchestrator image
#
# Debian slim + the Android platform-tools so the service can run
# `adb install` against redroid containers it spawns on the host daemon.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        android-sdk-platform-tools \
        adb \
        curl \
        ca-certificates \
    && command -v adb >/dev/null 2>&1 \
    && adb version \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# non-root is not possible here: the service talks to the docker socket.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
