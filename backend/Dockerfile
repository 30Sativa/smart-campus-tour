# syntax=docker/dockerfile:1
# Build context: backend/. Keep SDK and NuGet caches outside the runtime image.
ARG SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:10.0.401-noble
ARG RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:10.0.12-noble

FROM ${SDK_IMAGE} AS build
WORKDIR /source
COPY src/SmartCampus.Domain/SmartCampus.Domain.csproj src/SmartCampus.Domain/
COPY src/SmartCampus.Application/SmartCampus.Application.csproj src/SmartCampus.Application/
COPY src/SmartCampus.Infrastructure/SmartCampus.Infrastructure.csproj src/SmartCampus.Infrastructure/
COPY src/SmartCampus.Api/SmartCampus.Api.csproj src/SmartCampus.Api/
RUN --mount=type=cache,id=smartcampus-nuget,target=/root/.nuget/packages \
    dotnet restore src/SmartCampus.Api/SmartCampus.Api.csproj
COPY src/ ./src/
RUN --mount=type=cache,id=smartcampus-nuget,target=/root/.nuget/packages \
    dotnet publish src/SmartCampus.Api/SmartCampus.Api.csproj \
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
EXPOSE 8080 8443
USER $APP_UID
ENTRYPOINT ["dotnet", "SmartCampus.Api.dll"]
