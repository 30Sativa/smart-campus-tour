# syntax=docker/dockerfile:1
# Build context: backend/. Only published output enters the runtime image.
ARG SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:10.0.402-noble
ARG RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:10.0.13-noble
ARG SQLSERVER_IMAGE=mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04

FROM ${SDK_IMAGE} AS build
WORKDIR /source
COPY Directory.Build.props ./
COPY src/SmartCampus.Domain/SmartCampus.Domain.csproj src/SmartCampus.Domain/
COPY src/SmartCampus.Application/SmartCampus.Application.csproj src/SmartCampus.Application/
COPY src/SmartCampus.Infrastructure/SmartCampus.Infrastructure.csproj src/SmartCampus.Infrastructure/
COPY src/SmartCampus.Api/SmartCampus.Api.csproj src/SmartCampus.Api/
COPY src/SmartCampus.Domain/packages.lock.json src/SmartCampus.Domain/
COPY src/SmartCampus.Application/packages.lock.json src/SmartCampus.Application/
COPY src/SmartCampus.Infrastructure/packages.lock.json src/SmartCampus.Infrastructure/
COPY src/SmartCampus.Api/packages.lock.json src/SmartCampus.Api/
# Persist packages with obj/project.assets.json in this layer. External layer
# caches do not carry cache-mount contents to a fresh BuildKit builder.
RUN dotnet restore src/SmartCampus.Api/SmartCampus.Api.csproj --locked-mode
COPY src/ ./src/
RUN dotnet publish src/SmartCampus.Api/SmartCampus.Api.csproj \
    --configuration Release --no-restore --output /app/publish \
    -p:UseAppHost=false -p:DebugType=None -p:DebugSymbols=false

FROM ${RUNTIME_IMAGE} AS runtime
# curl provides an actual HTTPS process probe. Noble retains ICU for Vietnamese
# text and SqlClient; reflection-heavy EF/MediatR code is not trimmed or AOTed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=app:app /app/publish/ ./
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_EnableDiagnostics=0
ARG RUNTIME_IMAGE
ARG VCS_REF=unknown
ARG VERSION=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="Smart Campus Tour Backend API" \
      org.opencontainers.image.source="https://github.com/30Sativa/smart-campus-tour" \
      org.opencontainers.image.base.name="$RUNTIME_IMAGE" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.created="$BUILD_DATE"
EXPOSE 8080 8443
USER $APP_UID
ENTRYPOINT ["dotnet", "SmartCampus.Api.dll"]

FROM ${SQLSERVER_IMAGE} AS db-init
ARG VCS_REF=unknown
ARG VERSION=unknown
ARG BUILD_DATE=unknown
ARG SQLSERVER_IMAGE
# Set traverse permission on copied directories while keeping files non-writable.
COPY --chmod=u=rwX,go=rX deploy/init-db.sh /deployment/init-db.sh
COPY --chmod=u=rwX,go=rX \
    database/smart-campus-tour-schema-v1.1.sql \
    database/smart-campus-tour-schema-v1.2.sql \
    database/patches/upgrade-v1.1-to-v1.2-map-poi.sql \
    database/smart-campus-tour-map-poi-permissions.sql \
    database/smart-campus-tour-bootstrap-check.sql \
    database/smart-campus-tour-permissions.sql \
    database/smart-campus-tour-runtime-permissions.sql \
    /database/
LABEL org.opencontainers.image.title="Smart Campus Tour Database Initializer" \
      org.opencontainers.image.source="https://github.com/30Sativa/smart-campus-tour" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.created="$BUILD_DATE" \
      org.opencontainers.image.base.name="$SQLSERVER_IMAGE"
ENTRYPOINT ["/bin/bash", "/deployment/init-db.sh"]
