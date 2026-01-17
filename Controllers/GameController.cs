using Microsoft.AspNetCore.Mvc;
using TicTacToeGame.Models;
using TicTacToeGame.Services;

namespace TicTacToeGame.Controllers;

public sealed class GameController : Controller
{
    private readonly IGames _games;

    public GameController(IGames games)
    {
        _games = games;
    }

    [HttpGet("/Game/{id}")]
    public IActionResult Index(string id)
    {
        var result = _games.GetGame(id);
        if (result.IsFailure)
            return NotFound();

        var game = result.Value!;
        var vm = new GameViewModel
        {
            GameId = game.GameId,
            FriendlyName = game.FriendlyName,
            Game = game
        };

        return View(vm);
    }
}
