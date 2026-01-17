namespace TicTacToeGame.Models;

public sealed record Game(
    string GameId,
    string FriendlyName,
    string HostPlayer,
    string? GuestPlayer,
    GameState State);
