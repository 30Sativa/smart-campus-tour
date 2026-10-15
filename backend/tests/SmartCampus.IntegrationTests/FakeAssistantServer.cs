using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace SmartCampus.IntegrationTests;

/// <summary>Minimal HTTP/1.1 stand-in for ai-assistant's POST /v1/answer, bound to loopback.</summary>
internal sealed class FakeAssistantServer : IAsyncDisposable
{
    private readonly TcpListener listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource stop = new();
    private readonly Task loop;

    public ConcurrentQueue<(string Path, string Authorization, string Body)> Requests { get; } = new();
    public int Status { get; set; } = 200;
    public TimeSpan Delay { get; set; } = TimeSpan.Zero;
    public string ResponseBody { get; set; } =
        """{"answer":"Robot dùng LiDAR.","outOfScope":false,"usedSources":["Về robot"],"contentVersion":"test"}""";

    public FakeAssistantServer()
    {
        listener.Start();
        loop = Task.Run(AcceptAsync);
    }

    public string BaseUrl => $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}";

    private async Task AcceptAsync()
    {
        while (!stop.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await listener.AcceptTcpClientAsync(stop.Token);
            }
            catch (Exception exception) when (exception is OperationCanceledException or ObjectDisposedException or SocketException)
            {
                return;
            }
            _ = Task.Run(async () =>
            {
                using (client)
                {
                    try { await HandleAsync(client.GetStream()); }
                    catch (Exception exception) when (exception is IOException or SocketException or OperationCanceledException) { }
                }
            });
        }
    }

    private async Task HandleAsync(NetworkStream stream)
    {
        var received = new MemoryStream();
        var chunk = new byte[4096];
        var headerEnd = -1;
        while (headerEnd < 0)
        {
            var read = await stream.ReadAsync(chunk, stop.Token);
            if (read == 0) return;
            received.Write(chunk, 0, read);
            headerEnd = Encoding.Latin1.GetString(received.ToArray()).IndexOf("\r\n\r\n", StringComparison.Ordinal);
        }
        var headerText = Encoding.Latin1.GetString(received.ToArray(), 0, headerEnd);
        var lines = headerText.Split("\r\n");
        var path = lines[0].Split(' ')[1];
        string Header(string name) => lines.Skip(1)
            .Where(line => line.StartsWith(name + ":", StringComparison.OrdinalIgnoreCase))
            .Select(line => line[(name.Length + 1)..].Trim()).FirstOrDefault() ?? "";
        var length = int.TryParse(Header("Content-Length"), out var parsed) ? parsed : 0;
        while (received.Length < headerEnd + 4 + length)
        {
            var read = await stream.ReadAsync(chunk, stop.Token);
            if (read == 0) break;
            received.Write(chunk, 0, read);
        }
        var body = Encoding.UTF8.GetString(received.ToArray(), headerEnd + 4, (int)received.Length - headerEnd - 4);
        Requests.Enqueue((path, Header("Authorization"), body));

        if (Delay > TimeSpan.Zero) await Task.Delay(Delay, stop.Token);
        var payload = Encoding.UTF8.GetBytes(ResponseBody);
        var head = Encoding.ASCII.GetBytes($"HTTP/1.1 {Status} Fake\r\nContent-Type: application/json; charset=utf-8\r\n" +
            $"Content-Length: {payload.Length}\r\nConnection: close\r\n\r\n");
        await stream.WriteAsync(head, stop.Token);
        await stream.WriteAsync(payload, stop.Token);
    }

    public async ValueTask DisposeAsync()
    {
        await stop.CancelAsync();
        listener.Stop();
        try { await loop; } catch (OperationCanceledException) { }
        stop.Dispose();
    }
}
