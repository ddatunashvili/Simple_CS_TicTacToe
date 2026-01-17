// TicTacToe - Client-side JavaScript
// Organized into modules: Storage, UI Helpers, SignalR, Display Name, Lobby, Game

(function () {
    'use strict';

    // =========================================================================
    // Storage - sessionStorage wrapper for per-tab display name
    // =========================================================================
    var Storage = {
        DISPLAY_NAME_KEY: 'tictactoe.displayName',

        getDisplayName: function () {
            try {
                var v = sessionStorage.getItem(this.DISPLAY_NAME_KEY);
                return v ? v.trim() : '';
            } catch {
                return '';
            }
        },

        setDisplayName: function (value) {
            try {
                sessionStorage.setItem(this.DISPLAY_NAME_KEY, (value || '').trim());
            } catch {
                // ignore
            }
        }
    };

    // =========================================================================
    // UI Helpers - DOM manipulation utilities
    // =========================================================================
    var UI = {
        setAlertText: function (id, text) {
            var el = document.getElementById(id);
            if (el) el.textContent = text;
        },

        showError: function (id, msg) {
            var el = document.getElementById(id);
            if (!el) return;
            el.textContent = msg;
            el.hidden = false;
        },

        hideError: function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.hidden = true;
            el.textContent = '';
        },

        setDisabled: function (id, disabled) {
            var el = document.getElementById(id);
            if (el) el.disabled = disabled;
        }
    };

    // =========================================================================
    // SignalR - Hub connection management
    // =========================================================================
    var Hub = {
        connection: null,
        startPromise: null,
        eventHandlers: [], // Store handlers to re-register after reset

        ensureConnection: async function () {
            if (!window.signalR) {
                throw new Error('SignalR client not loaded.');
            }

            var displayName = Storage.getDisplayName();

            if (this.connection) {
                var state = this.connection.state;

                if (state === signalR.HubConnectionState.Connected) {
                    return this.connection;
                }

                if (state === signalR.HubConnectionState.Connecting ||
                    state === signalR.HubConnectionState.Reconnecting) {
                    if (this.startPromise) await this.startPromise;
                    return this.connection;
                }

                // Disconnected - restart
                this.startPromise = this.connection.start();
                await this.startPromise;
                return this.connection;
            }

            // Create new connection
            this.connection = new signalR.HubConnectionBuilder()
                .withUrl('/tictactoeHub?displayName=' + encodeURIComponent(displayName))
                .withAutomaticReconnect()
                .build();

            // Re-register all stored event handlers
            this.eventHandlers.forEach(function (h) {
                this.connection.on(h.event, h.handler);
            }, this);

            this.startPromise = this.connection.start();
            await this.startPromise;

            return this.connection;
        },

        on: function (eventName, handler) {
            this.eventHandlers = this.eventHandlers.filter(h => h.event !== eventName);
            this.eventHandlers.push({ event: eventName, handler: handler });

            if (this.connection) {
                this.connection.off(eventName);
                this.connection.on(eventName, handler);
            }
        },

        invoke: async function (methodName) {
            var connection = await this.ensureConnection();
            var args = Array.prototype.slice.call(arguments, 1);
            return connection.invoke.apply(connection, [methodName].concat(args));
        },

        reset: async function () {
            if (this.connection) {
                try {
                    await this.connection.stop();
                } catch {
                    // ignore
                }
                this.connection = null;
                this.startPromise = null;
            }
            // Note: eventHandlers are preserved so they get re-registered on next ensureConnection
        }
    };

    // =========================================================================
    // Display Name Module - Modal and identity management
    // =========================================================================
    var DisplayNameModule = {
        init: function (onNameSet) {
            var modalEl = document.getElementById('displayNameModal');
            if (!modalEl) return;

            var inputEl = document.getElementById('displayNameInput');
            var saveBtn = document.getElementById('displayNameSaveBtn');
            var form = document.getElementById('displayNameForm');

            if (Storage.getDisplayName()) return; // Already has name

            var modal = new bootstrap.Modal(modalEl, {
                backdrop: 'static',
                keyboard: false
            });
            modal.show();

            setTimeout(function () {
                if (inputEl) inputEl.focus();
            }, 150);

            var onSave = async function () {
                UI.hideError('displayNameError');

                var name = inputEl ? inputEl.value.trim() : '';
                if (!name) {
                    UI.showError('displayNameError', 'Please enter a display name.');
                    return;
                }
                if (name.length > 32) {
                    name = name.substring(0, 32);
                }

                Storage.setDisplayName(name);
                modal.hide();

                // Reset connection so new displayName is sent via query string
                await Hub.reset();

                await Hub.invoke('GetLobby');

                if (onNameSet) {
                    await onNameSet();
                }
            };

            if (saveBtn) {
                saveBtn.addEventListener('click', onSave);
            }
            if (form) {
                form.addEventListener('submit', function (e) {
                    e.preventDefault();
                    onSave();
                });
            }
        },

        refreshUI: function () {
            var name = Storage.getDisplayName();
            var hasName = !!name;

            var currentNameEl = document.getElementById('currentDisplayName');
            var currentNameValueEl = document.getElementById('currentDisplayNameValue');

            if (currentNameValueEl) currentNameValueEl.textContent = name;
            if (currentNameEl) currentNameEl.hidden = !hasName;

            UI.setDisabled('createGameBtn', !hasName);

            document.querySelectorAll('.js-join-game').forEach(function (btn) {
                btn.disabled = !hasName;
            });
        }
    };

    // =========================================================================
    // Lobby Module - Game list and create/join functionality
    // =========================================================================
    var LobbyModule = {
        renderWaitingGames: function (games) {
            this.gamesCache = games || [];

            var container = document.getElementById('waitingGamesList');
            if (!container) return;

            var displayName = Storage.getDisplayName();
            var hasName = !!displayName;

            if (!games || games.length === 0) {
                container.innerHTML = '<p class="text-muted">No games available.</p>';
                return;
            }

            var html = '<div class="list-group">';

            games.forEach(function (g) {
                var isHost = g.hostPlayer === displayName;
                var isGuest = g.guestPlayer === displayName;
                var isPlayerInGame = isHost || isGuest;
                var isFull = !!g.guestPlayer;

                html += `
        <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <div class="fw-semibold">${g.friendlyName}</div>
                <small class="text-muted">Id: ${g.gameId}</small>
            </div>
            <div>
 ${isPlayerInGame ? `
    <button type="button"
        class="btn btn-sm btn-outline-secondary ms-2 js-resume-game"
        data-game-id="${g.gameId}">
        Resume
    </button>
` : (isFull ? `
    <button type="button"
        class="btn btn-sm btn-outline-secondary ms-2" disabled>
        In Progress
    </button>
` : `
    <button type="button"
        class="btn btn-sm btn-outline-primary js-join-game"
        data-game-id="${g.gameId}"
        ${hasName ? '' : 'disabled'}>
        Join
    </button>
`)}

                ${(isPlayerInGame) ? `
                    <button type="button"
                        class="btn btn-sm btn-outline-danger ms-2 js-cancel-game"
                        data-game-id="${g.gameId}">
                        Cancel
                    </button>
                ` : ''}

            </div>
        </div>
        `;
            });

            html += '</div>';
            container.innerHTML = html;
        },

        handleCancelGame: async function (e) {
            var target = e.target.closest('.js-cancel-game');
            if (!target) return;

            var gameId = target.getAttribute('data-game-id');
            if (!gameId) return;

            var displayName = Storage.getDisplayName();
            if (!displayName) return;

            if (!confirm('Cancel this game?')) return;

            try {
                console.log("Cancel game", gameId, displayName);

                // ⚠️ IMPORTANT FIX:
                // CancelGame expects ONLY gameId.
                // Remove displayName argument.
                await Hub.invoke('CancelGame', gameId);

                await Hub.invoke('GetLobby');
            } catch (err) {
                alert('Failed to cancel game: ' + (err && err.message ? err.message : 'Unknown error'));
            }
        },

        init: async function () {

            var container = document.getElementById('waitingGamesList');
            var createForm = document.getElementById('createGameForm');

            if (!container && !createForm) return;

            // Register event handlers BEFORE ensuring connection
            Hub.on('LobbyUpdated', function (payload) {
                const games = payload.waitingGames || payload.games || [];
                LobbyModule.renderWaitingGames(games);

                DisplayNameModule.refreshUI();
            });

            Hub.on('GameCreated', function (payload) {
                window.location.href = '/Game/' + payload.gameId;
            });

            Hub.on('GameJoined', function (payload) {
                window.location.href = '/Game/' + payload.gameId;
            });

            try {
                await Hub.ensureConnection();

                // Initial load
                await Hub.invoke('GetLobby');

                // Create game form
                if (createForm) {
                    createForm.addEventListener('submit', this.handleCreateGame.bind(this));
                }

                // resume game button
                document.addEventListener('click', this.handleResumeGame.bind(this));

                // cancel game button (event)
                document.addEventListener('click', this.handleCancelGame.bind(this));

                // Join game button(event delegation)
                document.addEventListener('click', this.handleJoinGame.bind(this));

            } catch {
                // ignore connection errors
            }

            setTimeout(async () => {
                try {
                    await Hub.invoke('GetLobby');
                } catch { }
            }, 0);
        },

        handleResumeGame: function (e) {
            var target = e.target;
            if (!target.classList.contains('js-resume-game')) return;

            var gameId = target.getAttribute('data-game-id');
            if (!gameId) return;

            window.location.href = '/Game/' + gameId;
        },

        handleCreateGame: async function (e) {
            e.preventDefault();
            UI.hideError('createGameError');

            var input = document.getElementById('friendlyNameInput');
            var gameName = input ? input.value.trim() : '';

            if (!gameName) {
                UI.showError('createGameError', 'Please enter a game name.');
                return;
            }

            try {
                UI.setDisabled('createGameBtn', true);
                await Hub.invoke('CreateGame', gameName);
                await Hub.invoke('GetLobby');
            } catch (err) {
                UI.showError('createGameError', err && err.message ? err.message : 'Failed to create game.');
            } finally {
                UI.setDisabled('createGameBtn', false);
            }
        },

        handleJoinGame: async function (e) {
            var target = e.target;
            if (!target || !target.classList || !target.classList.contains('js-join-game')) return;

            var gameId = target.getAttribute('data-game-id');
            if (!gameId) return;

            try {
                var displayName = Storage.getDisplayName();
                var game = this.gamesCache.find(g => g.gameId === gameId);

                if (game && game.hostPlayer === displayName) {
                    // Host rejoining own game
                    window.location.href = '/Game/' + gameId;
                    return;
                }
                if (game && game.guestPlayer) {
                    alert("Game already has two players.");
                    return;
                }

                await Hub.invoke('JoinGame', gameId);
                await Hub.invoke('GetLobby');
            } catch (err) {
                var errorEl = document.getElementById('joinGameError');
                if (errorEl) {
                    errorEl.textContent = err && err.message ? err.message : 'Failed to join game.';
                    errorEl.hidden = false;
                }
            }
        }
    };

    // =========================================================================
    // Game Module - Board and gameplay
    // =========================================================================
    var GameModule = {
        state: null,
        cellButtons: null,
        countdownInterval: null,
        init: async function () {
            if (!window.ticTacToeGame || !document.getElementById('board')) return;

            var displayName = Storage.getDisplayName();
            if (!displayName) {
                window.location.href = '/';
                return;
            }

            var gameData = window.ticTacToeGame;
            var isHost = displayName === gameData.hostPlayer;
            var isGuest = displayName === gameData.guestPlayer;

            // Determine player mark (host = X, guest = O)
            var playerMark = isHost ? 'X' : (isGuest ? 'O' : '?');

            // Update UI with player mark
            var markEl = document.getElementById('playerMarkDisplay');
            if (markEl) markEl.textContent = playerMark;

            this.state = {
                gameId: gameData.gameId,
                playerId: displayName,
                playerMark: playerMark,
                status: 'WaitingForOpponent',
                nextTurnPlayerId: '',
                winnerPlayerId: ''
            };

            this.cellButtons = document.querySelectorAll('.js-cell');
            this.setCellsEnabled(false);
            UI.setAlertText('gameStatus', 'Connecting...');

            // Register handler before connection
            Hub.on('GameUpdated', this.handleGameUpdated.bind(this));

            try {
                await Hub.reset();
                await Hub.ensureConnection();

                await Hub.invoke('SubscribeGame', this.state.gameId);

                this.cellButtons.forEach(function (btn) {
                    btn.addEventListener('click', this.handleCellClick.bind(this));
                }, this);
                await Hub.invoke('GetLobby');
            } catch (err) {
                UI.setAlertText('gameStatus', err && err.message ? err.message : 'Failed to connect to game.');
            }
        },

        handleGameUpdated: function (payload) {
            if (!payload || !this.state || payload.gameId !== this.state.gameId) return;

            this.applyBoard(payload.board);
            this.state.status = payload.status;
            this.state.nextTurnPlayerId = payload.nextTurnPlayerId || '';
            this.state.winnerPlayerId = payload.winnerPlayerId || '';

            this.updateStatusText();
            this.setCellsEnabled(
                this.state.status === 'InProgress' &&
                this.state.nextTurnPlayerId === this.state.playerId
            );
        },

        handleCellClick: async function (e) {
            var btn = e.currentTarget;

            if (this.state.status !== 'InProgress') return;
            if (this.state.nextTurnPlayerId !== this.state.playerId) return;

            var idx = parseInt(btn.getAttribute('data-cell-index'), 10);

            try {
                this.setCellsEnabled(false);
                await Hub.invoke('MakeMove', this.state.gameId, idx);
            } catch (err) {
                UI.setAlertText('gameStatus', err && err.message ? err.message : 'Move failed.');
                this.setCellsEnabled(
                    this.state.status === 'InProgress' &&
                    this.state.nextTurnPlayerId === this.state.playerId
                );
            }
        },

        setCellsEnabled: function (enabled) {
            if (!this.cellButtons) return;
            this.cellButtons.forEach(function (btn) {
                btn.disabled = !enabled;
            });
        },

        applyBoard: function (board) {
            if (!board || !Array.isArray(board)) return;

            this.cellButtons.forEach(function (btn) {
                var idx = parseInt(btn.getAttribute('data-cell-index'), 10);
                var value = board[idx];

                if (value === 'X') {
                    btn.textContent = 'X';
                    btn.classList.remove('text-danger');
                    btn.classList.add('text-primary');
                } else if (value === 'O') {
                    btn.textContent = 'O';
                    btn.classList.remove('text-primary');
                    btn.classList.add('text-danger');
                } else {
                    btn.textContent = '';
                    btn.classList.remove('text-primary', 'text-danger');
                }
            });
        },

        updateStatusText: function () {
            var state = this.state;
            var statusEl = document.getElementById('gameStatus');

            // Reset classes
            if (statusEl) {
                statusEl.classList.remove('alert-info', 'alert-success', 'alert-danger');
            }

            if (state.status === 'WaitingForOpponent') {
                UI.setAlertText('gameStatus', 'Waiting for opponent...');
                if (statusEl) statusEl.classList.add('alert-info');
                return;
            }

            if (state.status === 'Finished') {
                let message = '';
                if (state.winnerPlayerId) {
                    if (state.winnerPlayerId === state.playerId) {
                        message = 'You won!';
                        if (statusEl) statusEl.classList.add('alert-success');
                    } else {
                        message = 'You lost.';
                        if (statusEl) statusEl.classList.add('alert-danger');
                    }
                } else {
                    message = 'Draw.';
                    if (statusEl) statusEl.classList.add('alert-info');
                }

                UI.setAlertText('gameStatus', message);

                // === SHOW MODAL POPUP ===
                let modalHtml = `
            <div class="modal fade" id="gameResultModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Game Over</h5>
                        </div>
                        <div class="modal-body">
                            <p>${message} You will be redirected to the lobby in <span id="countdown">10</span> seconds.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
                // Append modal to body if not exists
                if (!document.getElementById('gameResultModal')) {
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                }

                var resultModalEl = document.getElementById('gameResultModal');
                var bootstrapModal = new bootstrap.Modal(resultModalEl, { backdrop: 'static', keyboard: false });
                bootstrapModal.show();

                // Countdown
                let countdownEl = document.getElementById('countdown');
                let countdown = 10;
                window.addEventListener('beforeunload', () => {
                    if (this.countdownInterval) clearInterval(this.countdownInterval);
                });
                this.countdownInterval = setInterval(() => {
                    countdown--;
                    if (countdownEl) countdownEl.textContent = countdown;
                    if (countdown <= 0) {
                        clearInterval(this.countdownInterval);
                        this.countdownInterval = null;
                        bootstrapModal.hide();
                        window.location.href = '/Home/Index';
                    }
                }, 1000);

                return;
            }

            if (state.nextTurnPlayerId === state.playerId) {
                UI.setAlertText('gameStatus', 'Your turn.');
            } else {
                UI.setAlertText('gameStatus', "Opponent's turn.");
            }
            if (statusEl) statusEl.classList.add('alert-info');
        }

    };

    // =========================================================================
    // App Initialization
    // =========================================================================
    document.addEventListener('DOMContentLoaded', async function () {
        DisplayNameModule.refreshUI();

        DisplayNameModule.init(async function () {
            DisplayNameModule.refreshUI();
            try {
                await Hub.invoke('GetLobby');
            } catch {

            }
        });

        // Initialize lobby (Home page)
        await LobbyModule.init();

        // Initialize game (Game page)
        await GameModule.init();
    });

})();
