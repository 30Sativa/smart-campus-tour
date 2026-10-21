using Microsoft.Extensions.Logging;

namespace SmartCampus.IntegrationTests;

internal sealed class RecordingLogger<T> : ILogger<T>
{
    public List<string> Entries { get; } = [];
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel level) => true;
    public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
        Entries.Add(formatter(state, exception));
}
