namespace TicTacToeGame.Models;

public sealed class HomeLobbyViewModel
{
    public string? DisplayName { get; init; }
    public IReadOnlyCollection<Game> WaitingGames { get; init; } = Array.Empty<Game>();
}
