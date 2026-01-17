using System.Collections.Concurrent;
using TicTacToeGame.Models;

namespace TicTacToeGame.Services;

public sealed class Games : IGames
{
    private readonly ConcurrentDictionary<string, Game> _gamesById = new(StringComparer.Ordinal);
    private readonly object _lock = new();

    public Result<Game> CreateGame(string hostPlayer, string friendlyName)
    {
        if (string.IsNullOrWhiteSpace(hostPlayer))
            return "Host player is required.";

        friendlyName = (friendlyName ?? string.Empty).Trim();
        if (friendlyName.Length == 0)
            return "Friendly name is required.";
        if (friendlyName.Length > 50)
            friendlyName = friendlyName[..50];

        var gameId = Guid.NewGuid().ToString("N");

        var game = new Game(
            GameId: gameId,
            FriendlyName: friendlyName,
            HostPlayer: hostPlayer,
            GuestPlayer: null,
            State: new GameState(
                Board: new Cell[9],
                NextTurnPlayer: hostPlayer,
                Status: GameStatus.WaitingForOpponent,
                WinnerPlayer: null));

        _gamesById[gameId] = game;
        return game;
    }

    public Result<bool> CancelGame(string gameId, string player)
    {
        if (string.IsNullOrWhiteSpace(gameId))
            return "Game id is required.";

        if (string.IsNullOrWhiteSpace(player))
            return "Player is required.";

        lock (_lock)
        {
            if (!_gamesById.TryGetValue(gameId, out var game))
                return "Game not found.";

            if (game.HostPlayer != player && game.GuestPlayer != player)
                return "Only players can cancel the game.";

            // Fix: mark as Finished so it does not stay in lobby
            var updated = game with
            {
                State = game.State with { Status = GameStatus.Finished }
            };

            _gamesById[gameId] = updated;
            return true;
        }
    }

    public Result<Game> GetGame(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
            return "Game id is required.";

        if (!_gamesById.TryGetValue(gameId, out var game))
            return "Game not found.";

        return game;
    }

    public Result<Game> JoinGame(string gameId, string guestPlayer)
    {
        if (string.IsNullOrWhiteSpace(gameId))
            return "Game id is required.";

        if (string.IsNullOrWhiteSpace(guestPlayer))
            return "Guest player is required.";

        lock (_lock)
        {
            if (!_gamesById.TryGetValue(gameId, out var game))
                return "Game not found.";

            if (game.GuestPlayer is not null)
                return "Game already has two players.";

            if (game.HostPlayer == guestPlayer)
                return game;

            var updated = game with
            {
                GuestPlayer = guestPlayer,
                State = game.State with { Status = GameStatus.InProgress }
            };

            _gamesById[gameId] = updated;
            return updated;
        }
    }

    public Result<Game> MakeMove(string gameId, string player, int cellIndex)
    {
        if (string.IsNullOrWhiteSpace(gameId))
            return "Game id is required.";

        if (string.IsNullOrWhiteSpace(player))
            return "Player is required.";

        if (cellIndex < 0 || cellIndex > 8)
            return "Cell index out of range.";

        lock (_lock)
        {
            if (!_gamesById.TryGetValue(gameId, out var game))
                return "Game not found.";

            if (game.State.Status != GameStatus.InProgress)
                return "Game is not in progress.";

            if (game.GuestPlayer is null)
                return "Opponent not joined yet.";

            var isHost = game.HostPlayer == player;
            var isGuest = game.GuestPlayer == player;

            if (!isHost && !isGuest)
                return "Player is not part of this game.";

            if (game.State.NextTurnPlayer != player)
                return "Not your turn.";

            if (game.State.Board[cellIndex] != Cell.Empty)
                return "Cell already taken.";

            int[][] winningCombos =
            [
                [0,1,2], [3,4,5], [6,7,8],
                [0,3,6], [1,4,7], [2,5,8],
                [0,4,8], [2,4,6]
            ];

            var board = (Cell[])game.State.Board.Clone();
            var mark = isHost ? Cell.X : Cell.O;
            board[cellIndex] = mark;

            string? winner = null;
            foreach (var combo in winningCombos)
            {
                if (board[combo[0]] == mark &&
                    board[combo[1]] == mark &&
                    board[combo[2]] == mark)
                {
                    winner = player;
                    break;
                }
            }

            GameStatus status;
            string? nextTurn;

            if (winner != null)
            {
                status = GameStatus.Finished;
                nextTurn = null;
            }
            else if (board.All(c => c != Cell.Empty))
            {
                status = GameStatus.Finished;
                nextTurn = null;
            }
            else
            {
                status = GameStatus.InProgress;
                nextTurn = isHost ? game.GuestPlayer : game.HostPlayer;
            }

            var updated = game with
            {
                State = new GameState(
                    Board: board,
                    NextTurnPlayer: nextTurn,
                    Status: status,
                    WinnerPlayer: winner)
            };

            _gamesById[gameId] = updated;
            return updated;
        }
    }

    public IReadOnlyCollection<Game> GetAllNonFinished()
    {
        lock (_lock)
        {
            return _gamesById.Values
                .Where(g => g.State.Status != GameStatus.Finished)
                .ToArray();
        }
    }

    public IReadOnlyCollection<Game> GetWaitingForOpponent()
    {
        lock (_lock)
        {
            return _gamesById.Values
                .Where(g => g.State.Status == GameStatus.WaitingForOpponent)
                .ToArray();
        }
    }

    public IReadOnlyCollection<Game> GetAll()
        => _gamesById.Values.ToArray();
}
