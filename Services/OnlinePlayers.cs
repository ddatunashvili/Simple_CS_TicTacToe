using System.Collections.Concurrent;
using TicTacToeGame.Models;

namespace TicTacToeGame.Services;

public sealed class OnlinePlayers : IOnlinePlayers
{
    private readonly ConcurrentDictionary<string, OnlinePlayer> _playersByConnectionId = new(StringComparer.Ordinal);

    public IReadOnlyCollection<OnlinePlayer> GetAll() => _playersByConnectionId.Values.ToArray();

    public OnlinePlayer AddOrUpdate(string connectionId, string displayName)
    {
        if (string.IsNullOrWhiteSpace(connectionId))
            throw new ArgumentException("ConnectionId is required.", nameof(connectionId));

        displayName = displayName?.Trim() ?? string.Empty;
        if (displayName.Length == 0)
            displayName = "Player";

        return _playersByConnectionId.AddOrUpdate(
            connectionId,
            static (id, name) => new OnlinePlayer(id, name),
            static (id, existing, name) => existing with { DisplayName = name },
            displayName);
    }

    public bool Remove(string connectionId)
    {
        if (string.IsNullOrWhiteSpace(connectionId))
            return false;

        return _playersByConnectionId.TryRemove(connectionId, out _);
    }

    public bool TryGet(string connectionId, out OnlinePlayer? player)
    {
        if (string.IsNullOrWhiteSpace(connectionId))
        {
            player = null;
            return false;
        }

        return _playersByConnectionId.TryGetValue(connectionId, out player);
    }
}
