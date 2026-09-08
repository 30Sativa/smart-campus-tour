import * as signalR from '@microsoft/signalr'
import { apiUrl } from './client'

/**
 * Build a hub connection. The caller owns the lifecycle: nothing is started
 * here, and nothing connects on import.
 *
 * @param hubPath path relative to VITE_API_BASE_URL, e.g. `/hubs/fleet`.
 */
export function createHubConnection(
  hubPath: string,
  options?: signalR.IHttpConnectionOptions,
): signalR.HubConnection {
  return new signalR.HubConnectionBuilder()
    .withUrl(apiUrl(hubPath), options ?? {})
    .withAutomaticReconnect()
    .configureLogging(
      import.meta.env.DEV ? signalR.LogLevel.Information : signalR.LogLevel.Warning,
    )
    .build()
}
