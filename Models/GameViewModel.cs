namespace TicTacToeGame.Models;

public sealed class GameViewModel
{
    public required string GameId { get; init; }
    public required string FriendlyName { get; init; }
    public required Game Game { get; init; }
}
