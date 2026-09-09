// ============================================
// Rock Paper Scissors Clash – Autobet Module
// ============================================

(function () {
    "use strict";

    var MOVE_KEYS = ["rock", "paper", "scissors"];

    var autobetState = {
        enabled: false,
        roundsLeft: 0,
        totalRounds: 0,
        baseBet: 0,
        currentBet: 0,
        mode: "rock",
        currentChoice: "rock",
        startBalance: 0,
        profit: 0,
        pollTimer: null,
        _lastFinishedRound: 0
    };

    var dom = {};

    function cacheDom() {
        dom.toggle = document.getElementById("autobetToggle");
        dom.rounds = document.getElementById("autobetRounds");
        dom.choice = document.getElementById("autobetChoice");
        dom.stopWin = document.getElementById("autobetStopWin");
        dom.stopLoss = document.getElementById("autobetStopLoss");
        dom.onLoss = document.getElementById("autobetOnLoss");
        dom.onWin = document.getElementById("autobetOnWin");
        dom.status = document.getElementById("autobetStatus");
    }

    function init() {
        cacheDom();
        dom.toggle.addEventListener("click", toggleAutobet);
    }

    function toggleAutobet() {
        if (autobetState.enabled) {
            stopAutobet("Stopped by user");
        } else {
            startAutobet();
        }
    }

    function randomChoice() {
        return MOVE_KEYS[Math.floor(Math.random() * MOVE_KEYS.length)];
    }

    function startAutobet() {
        var api = window.RPSClash;
        if (!api) return;

        var gameState = api.getState();
        var gameDom = api.getDom();

        var rounds = parseInt(dom.rounds.value) || 10;
        var betVal = parseFloat(gameDom.betAmount.value);
        if (isNaN(betVal) || betVal <= 0) {
            setStatus("Invalid bet amount", "stopped");
            return;
        }

        var modeVal = dom.choice.value; // "rock" | "paper" | "scissors" | "random"

        autobetState.enabled = true;
        autobetState.totalRounds = rounds;
        autobetState.roundsLeft = rounds;
        autobetState.baseBet = betVal;
        autobetState.currentBet = betVal;
        autobetState.mode = modeVal;
        autobetState.currentChoice = modeVal === "random" ? randomChoice() : modeVal;
        autobetState.startBalance = gameState.playerBalance;
        autobetState.profit = 0;
        autobetState._lastFinishedRound = 0;

        dom.toggle.classList.add("active");
        setControlsDisabled(true);
        setStatus("Autobet ON \u2013 " + rounds + " rounds left", "running");

        pollForBetting();
    }

    function stopAutobet(reason) {
        autobetState.enabled = false;
        autobetState.roundsLeft = 0;

        if (autobetState.pollTimer) {
            clearInterval(autobetState.pollTimer);
            autobetState.pollTimer = null;
        }

        dom.toggle.classList.remove("active");
        setControlsDisabled(false);
        setStatus(reason || "Autobet OFF", "stopped");
    }

    function pollForBetting() {
        if (autobetState.pollTimer) {
            clearInterval(autobetState.pollTimer);
        }

        autobetState.pollTimer = setInterval(function () {
            if (!autobetState.enabled) {
                clearInterval(autobetState.pollTimer);
                autobetState.pollTimer = null;
                return;
            }

            var api = window.RPSClash;
            var gameState = api.getState();

            if (gameState.phase === "betting" && !gameState.playerBetPlaced) {
                tryPlaceBet();
            }

            if (gameState.phase === "finished" && autobetState._lastFinishedRound !== gameState.roundId) {
                autobetState._lastFinishedRound = gameState.roundId;
                onRoundFinished(gameState);
            }
        }, 300);
    }

    function tryPlaceBet() {
        var api = window.RPSClash;
        var gameState = api.getState();
        var gameDom = api.getDom();

        if (autobetState.roundsLeft <= 0) {
            stopAutobet("All rounds completed (" + autobetState.totalRounds + "/" + autobetState.totalRounds + ")");
            return;
        }

        var bet = Math.max(1, parseFloat(autobetState.currentBet.toFixed(2)));

        if (bet > gameState.playerBalance) {
            stopAutobet("Insufficient balance");
            return;
        }

        // Set bet amount
        gameDom.betAmount.value = bet;

        // Set choice (Rock/Paper/Scissors)
        gameState.playerChoice = autobetState.currentChoice;

        // Update choice button UI
        MOVE_KEYS.forEach(function (key) {
            gameDom.choiceBtn[key].classList.toggle("active", key === autobetState.currentChoice);
        });

        // Place bet via API
        api.placeBet();

        var played = autobetState.totalRounds - autobetState.roundsLeft + 1;
        var choiceLabel = autobetState.currentChoice.toUpperCase();
        setStatus("Round " + played + "/" + autobetState.totalRounds + " \u2013 \u20ac" + bet.toFixed(2) + " on " + choiceLabel, "running");
    }

    function onRoundFinished(gameState) {
        var playerEntry = gameState.currentRound.players.find(function (p) { return !p.isBot; });

        if (playerEntry) {
            if (playerEntry.result === "win") {
                autobetState.profit += playerEntry.potentialWin - playerEntry.bet;
                adjustBetOnWin();
            } else if (playerEntry.result === "lose") {
                autobetState.profit -= playerEntry.bet;
                adjustBetOnLoss();
            }
            // draw: stake is fully refunded — no profit change, bet left untouched for next round
        }

        autobetState.roundsLeft--;

        // If random mode, re-roll the choice for next round
        if (autobetState.mode === "random") {
            autobetState.currentChoice = randomChoice();
        }

        // Check stop conditions
        var stopWin = parseFloat(dom.stopWin.value) || 0;
        var stopLoss = parseFloat(dom.stopLoss.value) || 0;

        if (stopWin > 0 && autobetState.profit >= stopWin) {
            stopAutobet("Win target reached! Profit: \u20ac" + autobetState.profit.toFixed(2));
            return;
        }

        if (stopLoss > 0 && autobetState.profit <= -stopLoss) {
            stopAutobet("Loss limit reached! Loss: \u20ac" + Math.abs(autobetState.profit).toFixed(2));
            return;
        }

        if (autobetState.roundsLeft <= 0) {
            stopAutobet("All " + autobetState.totalRounds + " rounds completed. Profit: \u20ac" + autobetState.profit.toFixed(2));
            return;
        }
    }

    function adjustBetOnLoss() {
        var strategy = dom.onLoss.value;
        if (strategy === "double") {
            autobetState.currentBet = autobetState.currentBet * 2;
        } else {
            autobetState.currentBet = autobetState.baseBet;
        }
    }

    function adjustBetOnWin() {
        var strategy = dom.onWin.value;
        if (strategy === "double") {
            autobetState.currentBet = autobetState.currentBet * 2;
        } else {
            autobetState.currentBet = autobetState.baseBet;
        }
    }

    function setControlsDisabled(disabled) {
        dom.rounds.disabled = disabled;
        dom.choice.disabled = disabled;
        dom.stopWin.disabled = disabled;
        dom.stopLoss.disabled = disabled;
        dom.onLoss.disabled = disabled;
        dom.onWin.disabled = disabled;
    }

    function setStatus(msg, cls) {
        dom.status.textContent = msg;
        dom.status.className = "autobet-status " + (cls || "");
    }

    document.addEventListener("DOMContentLoaded", init);
})();
