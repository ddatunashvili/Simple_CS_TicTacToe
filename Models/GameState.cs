namespace TicTacToeGame.Models;

public enum GameStatus
{
    WaitingForOpponent = 0,
    InProgress = 1,
    Finished = 2
}

public enum Cell
{
    Empty = 0,
    X = 1,
    O = 2
}

public sealed record GameState(
    Cell[] Board,
    string? NextTurnPlayer,
    GameStatus Status,
    string? WinnerPlayer);
