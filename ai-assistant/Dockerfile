# Production image for the private Student Q&A service (ai-assistant/deploy/README.md).
# Build from the repo root or this folder: docker build -t campus-assistant ai-assistant
# Configuration comes only from the environment at run time; no .env or key enters the image.
FROM python:3.12-slim

LABEL org.opencontainers.image.source="https://github.com/30Sativa/smart-campus-tour" \
      org.opencontainers.image.description="CampusTour DT-AMR private Student Q&A service"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install . && useradd --system --uid 10001 --no-create-home assistant
COPY content ./content

# The approved content pack ships with the image; listen on all container interfaces.
# The port is never published on the host: only containers on the backend network reach it.
ENV AI_CONTENT_DIR=/app/content \
    AI_HOST=0.0.0.0 \
    AI_PORT=8090

USER assistant
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=4).status == 200 else 1)"]
CMD ["python", "-m", "campus_assistant"]
