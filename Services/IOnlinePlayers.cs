using TicTacToeGame.Models;

namespace TicTacToeGame.Services;

public interface IOnlinePlayers
{
    IReadOnlyCollection<OnlinePlayer> GetAll();
    OnlinePlayer AddOrUpdate(string connectionId, string displayName);
    bool Remove(string connectionId);
    bool TryGet(string connectionId, out OnlinePlayer? player);
}
