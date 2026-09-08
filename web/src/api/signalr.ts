import * as signalR from '@microsoft/signalr'

export function createHubConnection(hubUrl: string) {
  return new signalR.HubConnectionBuilder()
    .withUrl(hubUrl)
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Information)
    .build()
}