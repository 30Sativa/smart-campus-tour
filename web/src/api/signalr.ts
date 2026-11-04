import * as signalR from '@microsoft/signalr'
import { apiUrl } from './client'

/**
 * Build a hub connection. The caller owns the lifecycle: nothing is started
 * here, and nothing connects on import.
 *
 * @param hubPath path relative to VITE_API_BASE_URL, e.g. `/hubs/operations`.
 */
export function createHubConnection(
  hubPath: string,
  options?: signalR.IHttpConnectionOptions,
): signalR.HubConnection {
  return new signalR.HubConnectionBuilder()
    .withUrl(hubUrl(hubPath), options ?? {})
    .withAutomaticReconnect()
    .configureLogging(
      import.meta.env.DEV ? signalR.LogLevel.Information : signalR.LogLevel.Warning,
    )
    .build()
}

/**
 * An absolute hub URL. With an empty VITE_API_BASE_URL (same-origin deploy, CI)
 * `apiUrl` is a bare path, which SignalR refuses to resolve outside a real
 * browser ("Cannot resolve '/hubs/operations'"), so resolve it against the page.
 */
export function hubUrl(hubPath: string): string {
  return new URL(apiUrl(hubPath), window.location.href).href
}
