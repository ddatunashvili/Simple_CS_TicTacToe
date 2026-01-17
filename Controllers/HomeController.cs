using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using TicTacToeGame.Models;
using TicTacToeGame.Services;

namespace TicTacToeGame.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly IGames _games;

        public HomeController(ILogger<HomeController> logger, IGames games)
        {
            _logger = logger;
            _games = games;
        }

        public IActionResult Index()
        {
            var vm = new HomeLobbyViewModel
            {
                DisplayName = null,
                WaitingGames = _games.GetWaitingForOpponent()
            };

            return View(vm);
        }

        public IActionResult Privacy()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
