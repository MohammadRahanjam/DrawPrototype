// ============================================
// Rock Paper Scissors Clash – POC Game Engine
// ============================================

(function () {
    "use strict";

    // --- Configuration ---
    var CONFIG = {
        bettingDuration: 8,
        resultDuration: 4,
        revealDelay: 650,
        revealHoldDuration: 900,
        placeholderCycleInterval: 90,
        payout: 1.95,
        minBots: 3,
        maxBots: 15,
        botBetMin: 1,
        botBetMax: 50,
        botMaxDelay: 6,
        maxHistory: 10,
        playerStartBalance: 1000
    };

    // --- Bot Names ---
    var BOT_NAMES = [
        "CryptoKing", "LuckyAce", "NeonBet", "ShadowDice", "GoldRush",
        "PixelPunk", "ByteBet", "NightOwl", "StarDust", "IronClad",
        "VoltEdge", "HyperLuck", "ZenMaster", "AceHigh", "RocketMan",
        "BlueFox", "DarkHorse", "SilverBolt", "PhantomX", "TurboMax"
    ];

    // --- Moves ---
    var MOVES = {
        rock: { key: "rock", label: "ROCK", emoji: "\u270A", beats: "scissors" },
        paper: { key: "paper", label: "PAPER", emoji: "\u270B", beats: "rock" },
        scissors: { key: "scissors", label: "SCISSORS", emoji: "\u270C\uFE0F", beats: "paper" }
    };
    var MOVE_ORDER = ["rock", "paper", "scissors"];

    function resolveOutcome(playerChoice, dealerMove) {
        if (playerChoice === dealerMove) return "draw";
        if (MOVES[playerChoice].beats === dealerMove) return "win";
        return "lose";
    }

    function drawDealerMove() {
        return MOVE_ORDER[randInt(0, MOVE_ORDER.length - 1)];
    }

    // --- Game State ---
    var state = {
        roundId: 0,
        currentRound: null,
        history: [],             // [{ dealerMove, playerChoice: string|null, playerResult: string|null }], oldest first
        playerBalance: CONFIG.playerStartBalance,
        playerBetPlaced: false,
        playerChoice: "rock",
        countdownTimer: null,
        phase: "idle"
    };

    // --- DOM References ---
    var dom = {};

    // Placeholder cells for the round currently in its betting window
    var pendingDealerCell = null;
    var pendingPlayerCell = null;
    var dealerSpinTimer = null;

    function cacheDom() {
        dom.countdownEl = document.getElementById("timerText");
        dom.moveDisplay = document.getElementById("moveDisplay");
        dom.displayLabel = document.getElementById("displayLabel");
        dom.dealerHistoryTrack = document.getElementById("dealerHistoryTrack");
        dom.playerHistoryTrack = document.getElementById("playerHistoryTrack");
        dom.timerLineFill = document.getElementById("timerLineFill");
        dom.playerCount = document.getElementById("playerCount");
        dom.potValue = document.getElementById("potValue");
        dom.betAmount = document.getElementById("betAmount");
        dom.betStatus = document.getElementById("betStatus");
        dom.playersTableBody = document.getElementById("playersTableBody");
        dom.balanceValue = document.getElementById("balanceValue");
        dom.winToast = document.getElementById("winToast");
        dom.winToastDetail = document.getElementById("winToastDetail");
        dom.betHalfBtn = document.getElementById("betHalfBtn");
        dom.betDoubleBtn = document.getElementById("betDoubleBtn");
        dom.tutorialOverlay = document.getElementById("tutorialOverlay");
        dom.tutorialDismissBtn = document.getElementById("tutorialDismissBtn");
        dom.choiceBtn = {
            rock: document.getElementById("choiceRock"),
            paper: document.getElementById("choicePaper"),
            scissors: document.getElementById("choiceScissors")
        };
        dom.choiceStats = document.getElementById("choiceStats");
        dom.seg = {
            rock: document.getElementById("segRock"),
            paper: document.getElementById("segPaper"),
            scissors: document.getElementById("segScissors")
        };
        dom.pct = {
            rock: document.getElementById("pctRock"),
            paper: document.getElementById("pctPaper"),
            scissors: document.getElementById("pctScissors")
        };
    }

    // --- Bot Logic ---
    function generateBots() {
        var count = randInt(CONFIG.minBots, CONFIG.maxBots);
        var shuffled = shuffleArray(BOT_NAMES.slice());
        var bots = [];
        for (var i = 0; i < count; i++) {
            bots.push({
                id: "bot_" + i,
                name: shuffled[i % shuffled.length],
                isBot: true,
                bet: 0,
                choice: "",
                potentialWin: 0,
                result: "pending",
                placed: false
            });
        }
        return bots;
    }

    function scheduleBotBets(bots) {
        bots.forEach(function (bot) {
            var delay = Math.random() * CONFIG.botMaxDelay * 1000;
            setTimeout(function () {
                if (state.phase !== "betting") return;
                bot.bet = parseFloat(randFloat(CONFIG.botBetMin, CONFIG.botBetMax).toFixed(2));
                bot.choice = MOVE_ORDER[randInt(0, MOVE_ORDER.length - 1)];
                bot.potentialWin = parseFloat((bot.bet * CONFIG.payout).toFixed(2));
                bot.placed = true;
                state.currentRound.pot = calcPot();
                renderUI();
            }, delay);
        });
    }

    // --- Round Lifecycle ---
    function startGame() {
        cacheDom();

        MOVE_ORDER.forEach(function (key) {
            dom.choiceBtn[key].addEventListener("click", function () {
                if (dom.choiceBtn[key].disabled) return;
                state.playerChoice = key;
                onPlaceBet();
            });
        });

        dom.betDoubleBtn.addEventListener("click", function () {
            if (dom.betAmount.disabled) return;
            var val = parseFloat(dom.betAmount.value) || 0;
            dom.betAmount.value = Math.max(1, parseFloat((val * 2).toFixed(2)));
        });

        dom.betHalfBtn.addEventListener("click", function () {
            if (dom.betAmount.disabled) return;
            var val = parseFloat(dom.betAmount.value) || 0;
            dom.betAmount.value = Math.max(1, parseFloat((val / 2).toFixed(2)));
        });

        dom.tutorialDismissBtn.addEventListener("click", dismissTutorial);
        dom.tutorialOverlay.addEventListener("click", function (e) {
            if (e.target === dom.tutorialOverlay) dismissTutorial();
        });

        renderBalance();
        startBettingPhase();
    }

    function dismissTutorial() {
        dom.tutorialOverlay.classList.add("hidden");
    }

    function setChoiceControlsDisabled(disabled) {
        MOVE_ORDER.forEach(function (key) {
            dom.choiceBtn[key].disabled = disabled;
        });
        dom.betAmount.disabled = disabled;
        dom.betHalfBtn.disabled = disabled;
        dom.betDoubleBtn.disabled = disabled;
    }

    function startBettingPhase() {
        state.roundId++;
        state.phase = "betting";
        state.playerBetPlaced = false;

        var bots = generateBots();

        state.currentRound = {
            roundId: state.roundId,
            players: bots.slice(),
            pot: 0,
            dealerMove: null,
            status: "betting"
        };

        // Reset UI controls
        setChoiceControlsDisabled(false);
        dom.betStatus.textContent = "";
        dom.betStatus.className = "bet-status";

        // Reset display state
        dom.moveDisplay.className = "state-betting";
        dom.displayLabel.textContent = "PLACE YOUR BETS";

        // Reset timer line to full, instantly, then let updateCountdown animate it down
        dom.timerLineFill.style.transition = "none";
        dom.timerLineFill.style.width = "100%";
        dom.timerLineFill.style.background = "";
        void dom.timerLineFill.offsetWidth;
        dom.timerLineFill.style.transition = "";

        // Reset active state on choice buttons
        MOVE_ORDER.forEach(function (key) {
            dom.choiceBtn[key].classList.remove("active");
        });

        // Show a face-down "?" for this round in both rows the instant the timer starts
        pendingDealerCell = document.createElement("div");
        pendingDealerCell.className = "round-cell dealer-cell spinning new-entry";
        pendingDealerCell.textContent = MOVES[MOVE_ORDER[0]].emoji;
        dom.dealerHistoryTrack.insertBefore(pendingDealerCell, dom.dealerHistoryTrack.firstChild);

        if (dealerSpinTimer) clearInterval(dealerSpinTimer);
        dealerSpinTimer = setInterval(function () {
            pendingDealerCell.textContent = MOVES[MOVE_ORDER[randInt(0, MOVE_ORDER.length - 1)]].emoji;
        }, CONFIG.placeholderCycleInterval);

        pendingPlayerCell = document.createElement("div");
        pendingPlayerCell.className = "round-cell player-cell face-down new-entry";
        pendingPlayerCell.textContent = "\u2753";
        dom.playerHistoryTrack.insertBefore(pendingPlayerCell, dom.playerHistoryTrack.firstChild);

        scheduleBotBets(bots);
        renderUI();

        // Countdown
        var seconds = CONFIG.bettingDuration;
        updateCountdown(seconds);

        state.countdownTimer = setInterval(function () {
            seconds--;
            updateCountdown(seconds);
            if (seconds <= 0) {
                clearInterval(state.countdownTimer);
                startRound();
            }
        }, 1000);
    }

    function startRound() {
        state.phase = "revealing";
        state.currentRound.status = "running";

        // Lock betting
        setChoiceControlsDisabled(true);

        // Draw dealer move
        var dealerMove = drawDealerMove();
        state.currentRound.dealerMove = dealerMove;

        // Play reveal
        playRevealSequence(dealerMove, function () {
            evaluateResults();

            state.currentRound.status = "finished";
            state.phase = "finished";

            // Add this round's paired dealer/player record to history (newest first)
            var playerEntry = getPlayerEntry();
            var played = !!(playerEntry && playerEntry.betPlaced);
            state.history.unshift({
                dealerMove: dealerMove,
                playerChoice: played ? playerEntry.choice : null,
                playerResult: played ? playerEntry.result : null
            });
            if (state.history.length > CONFIG.maxHistory) {
                state.history.pop();
            }

            // Replace the temporary reveal cells with the authoritative rendered history
            pendingDealerCell = null;
            pendingPlayerCell = null;
            renderHistoryTrack();

            renderUI();

            // Wait result duration then start next round
            var resultSeconds = CONFIG.resultDuration;
            state.countdownTimer = setInterval(function () {
                resultSeconds--;
                if (resultSeconds <= 0) {
                    clearInterval(state.countdownTimer);
                    startBettingPhase();
                }
            }, 1000);
        });
    }

    function getPlayerEntry() {
        return state.currentRound.players.find(function (p) { return !p.isBot; });
    }

    function evaluateResults() {
        var dealerMove = state.currentRound.dealerMove;
        state.currentRound.players.forEach(function (p) {
            if (!p.placed && !p.betPlaced) {
                p.result = "pending";
                return;
            }

            var outcome = resolveOutcome(p.choice, dealerMove);
            p.result = outcome;

            if (outcome === "win" && !p.isBot) {
                state.playerBalance += p.potentialWin;
                state.playerBalance = parseFloat(state.playerBalance.toFixed(2));
                showWinToast(p.potentialWin, p.choice, dealerMove);
            } else if (outcome === "draw" && !p.isBot) {
                // Draw is a push — the stake is fully refunded, no win/loss
                state.playerBalance += p.bet;
                state.playerBalance = parseFloat(state.playerBalance.toFixed(2));
            }
        });
        renderBalance();

        // Update move display state based on the human player's own outcome
        var playerEntry = getPlayerEntry();
        dom.displayLabel.textContent = "ROUND RESULT";
        if (playerEntry && playerEntry.betPlaced) {
            if (playerEntry.result === "win") {
                dom.moveDisplay.className = "state-win";
            } else if (playerEntry.result === "draw") {
                dom.moveDisplay.className = "state-draw";
            } else {
                dom.moveDisplay.className = "state-lose";
            }
        } else {
            dom.moveDisplay.className = "state-neutral";
        }
    }

    // --- Player Betting ---
    function onPlaceBet() {
        if (state.phase !== "betting" || state.playerBetPlaced) return;

        var betVal = parseFloat(dom.betAmount.value);

        if (isNaN(betVal) || betVal <= 0) {
            showBetStatus("Invalid bet amount", "error");
            return;
        }
        if (betVal > state.playerBalance) {
            showBetStatus("Insufficient balance", "error");
            return;
        }

        state.playerBalance -= betVal;
        state.playerBalance = parseFloat(state.playerBalance.toFixed(2));
        renderBalance();

        var player = {
            id: "player",
            name: "You",
            isBot: false,
            bet: parseFloat(betVal.toFixed(2)),
            choice: state.playerChoice,
            potentialWin: parseFloat((betVal * CONFIG.payout).toFixed(2)),
            result: "pending",
            placed: true,
            betPlaced: true
        };

        state.currentRound.players.unshift(player);
        state.currentRound.pot = calcPot();
        state.playerBetPlaced = true;

        setChoiceControlsDisabled(true);

        // Highlight the chosen button
        MOVE_ORDER.forEach(function (key) {
            dom.choiceBtn[key].classList.toggle("active", key === state.playerChoice);
        });

        showBetStatus("Bet placed! \u20ac" + betVal.toFixed(2) + " on " + MOVES[state.playerChoice].label, "success");
        renderUI();
    }

    // --- Calculations ---
    function calcPot() {
        var pot = 0;
        state.currentRound.players.forEach(function (p) {
            if (p.placed || p.betPlaced) pot += p.bet;
        });
        return parseFloat(pot.toFixed(2));
    }

    function calcChoiceStats() {
        var counts = { rock: 0, paper: 0, scissors: 0 };
        var amounts = { rock: 0, paper: 0, scissors: 0 };
        var total = 0;
        state.currentRound.players.forEach(function (p) {
            if ((p.placed || p.betPlaced) && counts.hasOwnProperty(p.choice)) {
                counts[p.choice]++;
                amounts[p.choice] += p.bet;
                total++;
            }
        });
        return { counts: counts, amounts: amounts, total: total };
    }

    // ============================================
    // Clash Reveal Animation
    // ============================================
    // Reveal Sequence — a new paired dealer/player cell lands on the left of each row
    // ============================================

    function buildDealerCell(dealerMoveKey) {
        var cell = document.createElement("div");
        cell.className = "round-cell dealer-cell " + MOVES[dealerMoveKey].key;
        cell.textContent = MOVES[dealerMoveKey].emoji;
        return cell;
    }

    function buildPlayerCell(playerChoiceKey, playerResult) {
        var cell = document.createElement("div");
        if (playerChoiceKey) {
            cell.className = "round-cell player-cell result-" + playerResult;
            cell.textContent = MOVES[playerChoiceKey].emoji;
        } else {
            cell.className = "round-cell player-cell missed";
        }
        return cell;
    }

    function playRevealSequence(dealerMove, onComplete) {
        dom.displayLabel.textContent = "REVEALING...";
        dom.moveDisplay.className = "state-reveal";

        var playerEntry = getPlayerEntry();
        var hasPlayer = !!(playerEntry && playerEntry.betPlaced);

        // Flip the "?" placeholders that were already sitting in both rows since betting started
        var dealerCell = pendingDealerCell;
        var playerCell = pendingPlayerCell;

        setTimeout(function () {
            // Stop the dealer's randomizing spin and flip both cells to the real moves
            if (dealerSpinTimer) {
                clearInterval(dealerSpinTimer);
                dealerSpinTimer = null;
            }
            var dealerMoveInfo = MOVES[dealerMove];
            dealerCell.textContent = dealerMoveInfo.emoji;
            dealerCell.classList.remove("spinning");
            dealerCell.classList.add(dealerMoveInfo.key);

            if (hasPlayer) {
                var outcome = resolveOutcome(playerEntry.choice, dealerMove);
                var playerMoveInfo = MOVES[playerEntry.choice];
                playerCell.textContent = playerMoveInfo.emoji;
                playerCell.classList.remove("face-down");
                playerCell.classList.add("result-" + outcome);
            } else {
                playerCell.classList.remove("face-down");
                playerCell.classList.add("missed");
            }

            setTimeout(onComplete, CONFIG.revealHoldDuration);
        }, CONFIG.revealDelay);
    }

    // ============================================
    // Rendering
    // ============================================

    function renderUI() {
        renderPot();
        renderPlayersTable();
        renderChoiceStats();
    }

    function updateCountdown(seconds) {
        if (state.phase === "betting") {
            dom.countdownEl.textContent = seconds;
            var fraction = seconds / CONFIG.bettingDuration;
            dom.timerLineFill.style.width = (fraction * 100) + "%";
            dom.timerLineFill.style.background = fraction <= 0.25 ? "#ef4444" : "#22c55e";
        }
    }

    function renderPot() {
        var activePlayers = state.currentRound.players.filter(function (p) { return p.placed || p.betPlaced; });
        dom.playerCount.textContent = activePlayers.length;
        dom.potValue.textContent = (state.currentRound.pot || 0).toFixed(2);
    }

    function renderPlayersTable() {
        var tbody = dom.playersTableBody;
        tbody.innerHTML = "";

        var sortedPlayers = state.currentRound.players.filter(function (p) { return p.placed || p.betPlaced; });

        sortedPlayers.forEach(function (p) {
            var tr = document.createElement("tr");
            var rowClass = "row-pending";
            if (state.phase === "finished") {
                if (p.result === "win") rowClass = "row-win";
                else if (p.result === "lose") rowClass = "row-lose";
                else if (p.result === "draw") rowClass = "row-draw";
            }
            tr.className = rowClass;
            if (!p.isBot) tr.classList.add("row-you");

            var statusText = "Betting";
            var statusClass = "pending";
            if (state.phase === "finished") {
                if (p.result === "win") { statusText = "Won"; statusClass = "win"; }
                else if (p.result === "lose") { statusText = "Lost"; statusClass = "lose"; }
                else if (p.result === "draw") { statusText = "Draw"; statusClass = "draw"; }
            }

            var move = MOVES[p.choice];
            var choiceDisplay = move ? (move.emoji + " " + move.label) : "";
            var choiceClass = move ? ("choice-" + move.key + "-text") : "";

            tr.innerHTML =
                "<td>" + escapeHtml(p.name) + "</td>" +
                "<td>" + p.bet.toFixed(2) + "</td>" +
                "<td><span class='choice-display " + choiceClass + "'>" + choiceDisplay + "</span></td>" +
                "<td>" + p.potentialWin.toFixed(2) + "</td>" +
                "<td><span class='status-badge " + statusClass + "'>" + statusText + "</span></td>";

            tbody.appendChild(tr);
        });
    }

    function renderHistoryTrack() {
        dom.dealerHistoryTrack.innerHTML = "";
        dom.playerHistoryTrack.innerHTML = "";

        state.history.forEach(function (entry) {
            dom.dealerHistoryTrack.appendChild(buildDealerCell(entry.dealerMove));
            dom.playerHistoryTrack.appendChild(buildPlayerCell(entry.playerChoice, entry.playerResult));
        });
    }

    function renderChoiceStats() {
        var stats = calcChoiceStats();
        var hasData = stats.total > 0;
        dom.choiceStats.classList.toggle("has-data", hasData);

        MOVE_ORDER.forEach(function (key) {
            var pct = hasData ? Math.round((stats.counts[key] / stats.total) * 100) : 0;
            dom.pct[key].textContent = pct + "% \u2022 \u20ac" + stats.amounts[key].toFixed(2);
            dom.seg[key].style.width = pct + "%";
        });
    }

    function renderBalance() {
        if (dom.balanceValue) {
            dom.balanceValue.textContent = state.playerBalance.toFixed(2);
        }
    }

    function showBetStatus(msg, type) {
        dom.betStatus.textContent = msg;
        dom.betStatus.className = "bet-status " + (type || "");
    }

    // --- Win Toast ---
    function showWinToast(payout, choice, dealerMove) {
        var move = MOVES[choice];
        var dealer = MOVES[dealerMove];
        dom.winToastDetail.textContent = "+" + payout.toFixed(2) + " on " + move.label + " \u2014 Dealer threw " + dealer.emoji + " " + dealer.label;
        showToast(dom.winToast, 2000);
    }

    function showToast(toastEl, duration) {
        var backdrop = document.createElement("div");
        backdrop.className = "toast-backdrop";
        document.body.appendChild(backdrop);

        requestAnimationFrame(function () {
            backdrop.classList.add("visible");
            toastEl.classList.remove("hidden");
            toastEl.classList.add("visible");
        });

        setTimeout(function () {
            toastEl.classList.remove("visible");
            toastEl.classList.add("hidden");
            backdrop.classList.remove("visible");
            setTimeout(function () {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
            }, 300);
        }, duration);
    }

    // --- Utilities ---
    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    function shuffleArray(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
        return arr;
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // --- Init ---
    document.addEventListener("DOMContentLoaded", startGame);

    // --- Public API for autobet module ---
    window.RPSClash = {
        getState: function () { return state; },
        getDom: function () { return dom; },
        placeBet: onPlaceBet,
        getConfig: function () { return CONFIG; }
    };
})();
