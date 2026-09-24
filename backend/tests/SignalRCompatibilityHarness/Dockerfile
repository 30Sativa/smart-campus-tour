FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY SignalRCompatibilityHarness.csproj ./
RUN dotnet restore SignalRCompatibilityHarness.csproj
COPY Program.cs ./
RUN dotnet publish SignalRCompatibilityHarness.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out ./
ENV ASPNETCORE_URLS=https://+:5443 S1_PORT=5443 S1_CERTIFICATE=/certs/server.pfx
ENTRYPOINT ["dotnet", "SignalRCompatibilityHarness.dll"]
