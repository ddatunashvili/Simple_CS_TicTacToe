using Microsoft.AspNetCore.SignalR;
using TicTacToeGame.Models;
using TicTacToeGame.Services;

namespace TicTacToeGame.Hubs;

public sealed class TicTacToeHub : Hub
{
    private const string DisplayNameItemKey = "DisplayName";

    private readonly IOnlinePlayers _onlinePlayers;
    private readonly IGames _games;

    public TicTacToeHub(IOnlinePlayers onlinePlayers, IGames games)
    {
        _onlinePlayers = onlinePlayers;
        _games = games;
    }

    public override async Task OnConnectedAsync()
    {
        var displayName = Context.GetHttpContext()?.Request.Query["displayName"].ToString();
        displayName = (displayName ?? string.Empty).Trim();

        if (!string.IsNullOrWhiteSpace(displayName))
        {
            if (displayName.Length > 32)
                displayName = displayName[..32];

            Context.Items[DisplayNameItemKey] = displayName;
            _onlinePlayers.AddOrUpdate(Context.ConnectionId, displayName);
        }

        await BroadcastLobbyAsync();
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _onlinePlayers.Remove(Context.ConnectionId);
        await BroadcastLobbyAsync();
        await base.OnDisconnectedAsync(exception);
    }

    public Task GetLobby() => BroadcastLobbyAsync();

    public async Task CreateGame(string friendlyName)
    {
        var displayName = GetDisplayNameOrThrow();

        var result = _games.CreateGame(hostPlayer: displayName, friendlyName: friendlyName);
        if (result.IsFailure)
            throw new HubException(result.Error);

        var game = result.Value!;
        await Groups.AddToGroupAsync(Context.ConnectionId, GetGameGroup(game.GameId));

        await Clients.Caller.SendAsync("GameCreated", new { gameId = game.GameId, friendlyName = game.FriendlyName });
        await BroadcastLobbyAsync();
        await BroadcastGameAsync(game.GameId);
    }

    public async Task JoinGame(string gameId)
    {
        var displayName = GetDisplayNameOrThrow();

        var result = _games.JoinGame(gameId, guestPlayer: displayName);
        if (result.IsFailure)
            throw new HubException(result.Error);

        var game = result.Value!;
        await Groups.AddToGroupAsync(Context.ConnectionId, GetGameGroup(gameId));

        await Clients.Caller.SendAsync("GameJoined", new { gameId = game.GameId, friendlyName = game.FriendlyName });
        await BroadcastLobbyAsync();
        await BroadcastGameAsync(gameId);
    }

    public async Task SubscribeGame(string gameId)
    {
        var displayName = GetDisplayNameOrThrow();

        var result = _games.GetGame(gameId);
        if (result.IsFailure)
            throw new HubException(result.Error);

        var game = result.Value!;
        var isParticipant = string.Equals(game.HostPlayer, displayName, StringComparison.Ordinal) ||
                            string.Equals(game.GuestPlayer, displayName, StringComparison.Ordinal);

        if (!isParticipant)
            throw new HubException("You are not a participant of this game.");

        await Groups.AddToGroupAsync(Context.ConnectionId, GetGameGroup(gameId));
        await BroadcastGameAsync(gameId);
    }

    public async Task MakeMove(string gameId, int cellIndex)
    {
        var displayName = GetDisplayNameOrThrow();

        var result = _games.MakeMove(gameId, displayName, cellIndex);
        if (result.IsFailure)
            throw new HubException(result.Error);

        await BroadcastGameAsync(gameId);
    }

    private string GetDisplayNameOrThrow()
    {
        if (Context.Items.TryGetValue(DisplayNameItemKey, out var v) && v is string s && !string.IsNullOrWhiteSpace(s))
            return s;

        throw new HubException("Display name not set.");
    }

    private Task BroadcastLobbyAsync()
    {
        var waiting = _games.GetWaitingForOpponent()
            .Select(g => new { gameId = g.GameId, friendlyName = g.FriendlyName })
            .ToArray();

        return Clients.All.SendAsync("LobbyUpdated", new { waitingGames = waiting });
    }

    private Task BroadcastGameAsync(string gameId)
    {
        var result = _games.GetGame(gameId);
        if (result.IsFailure)
            return Task.CompletedTask;

        var game = result.Value!;
        var payload = new
        {
            gameId = game.GameId,
            status = game.State.Status.ToString(),
            nextTurnPlayerId = game.State.NextTurnPlayer,
            winnerPlayerId = game.State.WinnerPlayer,
            board = game.State.Board.Select(c => c.ToString()).ToArray()
        };

        return Clients.Group(GetGameGroup(gameId)).SendAsync("GameUpdated", payload);
    }

    private static string GetGameGroup(string gameId) => $"game:{gameId}";
}
