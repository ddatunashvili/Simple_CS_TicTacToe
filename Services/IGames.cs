using TicTacToeGame.Models;

namespace TicTacToeGame.Services;

public interface IGames
{
    Result<Game> CreateGame(string hostPlayer, string friendlyName);
    Result<Game> JoinGame(string gameId, string guestPlayer);
    Result<Game> GetGame(string gameId);
    Result<Game> MakeMove(string gameId, string player, int cellIndex);
    Result<bool> CancelGame(string gameId, string player);
    IReadOnlyCollection<Game> GetWaitingForOpponent();
    IReadOnlyCollection<Game> GetAll();
    IReadOnlyCollection<Game> GetAllNonFinished();

}
