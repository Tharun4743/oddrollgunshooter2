const socket = io();

let gameState = {
  playerId: null,
  playerName: null,
  roomKey: null,
  players: [],
  currentPlayer: null,
  myState: null,
  canShoot: false,
  selectedTarget: null,
  isRoomCreator: false,
};

const loginScreen = document.getElementById("loginScreen");
const lobbyScreen = document.getElementById("lobbyScreen");
const gameScreen = document.getElementById("gameScreen");

const playerNameInput = document.getElementById("playerName");
const roomKeyInput = document.getElementById("roomKey");
const newRoomKeyInput = document.getElementById("newRoomKey");
const maxPlayersInput = document.getElementById("maxPlayers");

const joinButton = document.getElementById("joinButton");
const createRoomButton = document.getElementById("createRoomButton");
const confirmCreateButton = document.getElementById("confirmCreateButton");
const backButton = document.getElementById("backButton");

const roomKeyDisplay = document.getElementById("roomKeyDisplay");
const lobbyPlayers = document.getElementById("lobbyPlayers");

const startGameButton = document.getElementById("startGameButton");
const currentTurnDisplay = document.getElementById("currentTurnDisplay");
const playerNameLabel = document.getElementById("playerNameLabel");
const playersListContainer = document.getElementById("playersListContainer");

const diceDisplay = document.getElementById("diceDisplay");
const rollDiceButton = document.getElementById("rollDiceButton");
const rollResult = document.getElementById("rollResult");

const shootButton = document.getElementById("shootButton");

const gameLog = document.getElementById("gameLog");

const shootModal = document.getElementById("shootModal");
const closeShootModal = document.getElementById("closeShootModal");
const targetPlayersContainer = document.getElementById("targetPlayersContainer");
const disableNumberContainer = document.getElementById("disableNumberContainer");

const winnerModal = document.getElementById("winnerModal");
const winnerName = document.getElementById("winnerName");
const newGameButton = document.getElementById("newGameButton");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatButton = document.getElementById("sendChatButton");

joinButton.addEventListener("click", joinRoom);
createRoomButton.addEventListener("click", showCreateMode);
backButton.addEventListener("click", showJoinMode);
confirmCreateButton.addEventListener("click", createRoom);
startGameButton.addEventListener("click", startGame);
rollDiceButton.addEventListener("click", rollDice);
shootButton.addEventListener("click", showShootModal);
closeShootModal.addEventListener("click", hideShootModal);
sendChatButton.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChatMessage();
});
newGameButton.addEventListener("click", () => location.reload());

function showCreateMode() {
  joinMode.style.display = "none";
  createMode.style.display = "block";
}

function showJoinMode() {
  createMode.style.display = "none";
  joinMode.style.display = "block";
}

function joinRoom() {
  const playerName = playerNameInput.value.trim();
  const roomKey = roomKeyInput.value.trim();

  if (!playerName || !roomKey) {
    alert("Please enter your name and room key!");
    return;
  }

  gameState.playerName = playerName;
  gameState.isRoomCreator = false;

  socket.emit("joinRoom", {
    playerName: playerName,
    roomKey: roomKey,
    maxPlayers: 6,
  });
}

function createRoom() {
  const playerName = playerNameInput.value.trim();
  const roomKey = newRoomKeyInput.value.trim();
  const maxPlayers = parseInt(maxPlayersInput.value);

  if (!playerName || !roomKey) {
    alert("Please enter your name and room key!");
    return;
  }

  gameState.playerName = playerName;
  gameState.isRoomCreator = true;

  socket.emit("joinRoom", {
    playerName: playerName,
    roomKey: roomKey,
    maxPlayers: maxPlayers,
  });
}

socket.on("joinSuccess", (data) => {
  gameState.playerId = data.playerId;
  gameState.roomKey = data.roomKey;
  gameState.players = data.players;

  roomKeyDisplay.textContent = data.roomKey;
  playerNameLabel.textContent = `Player: ${gameState.playerName}`;

  updateLobbyPlayers(data.players);
  switchScreen("lobby");
  addLog("Successfully joined the game!");
});

socket.on("joinFailed", (data) => {
  alert(data.message);
});

socket.on("playerJoined", (data) => {
  gameState.players = data.players;
  updateLobbyPlayers(data.players);
  addLog(`Player joined! Total players: ${data.players.length}`);
});

socket.on("playerLeft", (data) => {
  gameState.players = data.players;
  updatePlayersList(data.players);
  addLog("A player left the game");
});

socket.on("gameStarted", (data) => {
  gameState.currentPlayer = data.currentPlayer;
  gameState.players = data.players;

  switchScreen("game");
  updatePlayersList(data.players);
  updateCurrentTurn();
  addLog("🎮 Game Started!", true);
});

socket.on("diceRolled", (data) => {
  diceDisplay.classList.add("rolling");

  setTimeout(() => {
    diceDisplay.textContent = data.rolledNumber;
    diceDisplay.classList.remove("rolling");

    if (data.result.success) {
      displayRollResult(data.playerName, data.rolledNumber, data.result, true);

      if (data.playerId === gameState.playerId) {
        gameState.myState = data.currentPlayerState;
        updateMyBoxes();

        if (data.result.canShoot) {
          gameState.canShoot = true;
          shootButton.disabled = false;
          addLog("🔫 You can now SHOOT!", true);
        } else {
          shootButton.disabled = true;
        }
        rollDiceButton.disabled = false;
      }
    } else {
      displayRollResult(data.playerName, data.rolledNumber, data.result, false);
    }

    addLog(`${data.playerName} rolled ${data.rolledNumber}: ${data.result.message}`);
  }, 500);
});

socket.on("turnChanged", (data) => {
  gameState.currentPlayer = data.currentPlayer;
  gameState.players = data.players;
  gameState.canShoot = false;

  updatePlayersList(data.players);
  updateCurrentTurn();
  rollResult.innerHTML = "";
  diceDisplay.textContent = "?";

  if (gameState.currentPlayer.id === gameState.playerId) {
    rollDiceButton.disabled = false;
  } else {
    rollDiceButton.disabled = true;
  }

  shootButton.disabled = true;
  addLog(`It's now ${data.currentPlayer.name}'s turn`, true);
});

socket.on("playerShot", (data) => {
  addLog(`🔫 ${data.message}`, true);

  if (data.targetId === gameState.playerId) {
    socket.emit("getGameState");
  }

  gameState.players = data.updatedPlayers;
  updatePlayersList(data.updatedPlayers);
});

socket.on("gameOver", (data) => {
  winnerName.textContent = `${data.winner.name} Wins!`;
  winnerModal.classList.add("active");
  addLog(`🏆 ${data.winner.name} wins the game!`, true);

  rollDiceButton.disabled = true;
  shootButton.disabled = true;
});

socket.on("gameState", (data) => {
  gameState.myState = data.myState;
  gameState.players = data.players;
  gameState.currentPlayer = data.currentPlayer;

  updateMyBoxes();
  updatePlayersList(data.players);
});

socket.on("notYourTurn", (data) => {
  alert(data.message);
});

socket.on("chatMessage", (data) => {
  displayChatMessage(data.playerName, data.message, data.playerId === gameState.playerId);
});

function startGame() {
  if (!gameState.isRoomCreator) {
    alert("Only the room creator can start the game!");
    return;
  }
  socket.emit("startGame");
}

function rollDice() {
  if (gameState.currentPlayer.id !== gameState.playerId) {
    alert("It's not your turn!");
    return;
  }
  if (gameState.myState && gameState.myState.mustShoot) {
    alert("You MUST shoot before rolling again!");
    return;
  }
  rollDiceButton.disabled = true;
  socket.emit("rollDice");
}

function displayRollResult(playerName, rolledNumber, result, success) {
  const resultDiv = document.createElement("div");
  resultDiv.className = "roll-result-item";

  if (success) {
    let visualization = "";

    if (result.message.includes("Face")) {
      visualization = '<div class="content-item"><div class="content-label">Face Found</div><div class="box-face">😊</div></div>';
    }

    if (result.message.includes("Full Body")) {
      visualization = '<div class="content-item"><div class="content-label">Body Found</div><div class="box-body">🧍</div></div>';
    }

    if (result.message.includes("Gun")) {
      let bulletCount = 1;
      if (result.message.includes("2 bullets")) bulletCount = 2;
      if (result.message.includes("3 bullets")) bulletCount = 3;

      let bullets = "";
      for (let i = 0; i < bulletCount; i++) {
        bullets += '<span class="bullet-icon">🔴</span>';
      }
      visualization = `<div class="content-item"><div class="content-label">Bullets: ${bulletCount}</div><div class="bullets-visual">${bullets}</div></div>`;
    }

    resultDiv.innerHTML = `
      <strong>${playerName}</strong> rolled <strong>${rolledNumber}</strong>
      <div style="font-size: 12px; margin-top: 8px; opacity: 0.8;">${result.message}</div>
      ${visualization}
    `;
  } else {
    resultDiv.innerHTML = `
      <strong>${playerName}</strong> rolled <strong>${rolledNumber}</strong>
      <div style="font-size: 12px; margin-top: 8px; opacity: 0.8;">${result.message}</div>
    `;
  }

  rollResult.innerHTML = "";
  rollResult.appendChild(resultDiv);
  rollResult.classList.add("new-content");
  setTimeout(() => rollResult.classList.remove("new-content"), 400);
}

function showShootModal() {
  if (!gameState.canShoot) {
    alert("You need 3 bullets to shoot!");
    return;
  }
  const aliveOpponents = gameState.players.filter((p) => p.id !== gameState.playerId && p.isAlive);
  if (aliveOpponents.length === 0) {
    alert("No alive opponents to shoot!");
    return;
  }
  targetPlayersContainer.innerHTML = "";

  aliveOpponents.forEach((player) => {
    const targetDiv = document.createElement("div");
    targetDiv.className = "target-player";
    targetDiv.textContent = player.name;
    targetDiv.onclick = () => selectTarget(player.id);
    targetPlayersContainer.appendChild(targetDiv);
  });

  shootModal.classList.add("active");
}

function hideShootModal() {
  shootModal.classList.remove("active");
  disableNumberContainer.style.display = "none";
  gameState.selectedTarget = null;
}

function selectTarget(targetId) {
  gameState.selectedTarget = targetId;
  disableNumberContainer.style.display = "block";

  document.querySelectorAll(".btn-number").forEach((btn) => {
    btn.onclick = () => {
      const disableNum = parseInt(btn.dataset.num);
      shootPlayer(targetId, disableNum);
    };
  });
}

function shootPlayer(targetId, disableNumber) {
  const target = gameState.players.find((p) => p.id === targetId);
  if (!target || !target.isAlive) {
    alert("Invalid target!");
    return;
  }
  if (![1, 3, 5, 7, 9].includes(disableNumber)) {
    alert("Invalid number to disable!");
    return;
  }
  socket.emit("shootPlayer", { targetId, disableNumber });

  hideShootModal();
  gameState.canShoot = false;
  shootButton.disabled = true;
}

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  if (message.length > 200) {
    alert("Message is too long! (Max 200 characters)");
    return;
  }
  socket.emit("sendChat", { message });

  chatInput.value = "";
  chatInput.focus();
}

function displayChatMessage(playerName, message, isOwnMessage = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${isOwnMessage ? "own-message" : ""}`;
  messageDiv.innerHTML = `
    <div class="chat-message-sender">${playerName}:</div>
    <div class="chat-message-text">${escapeHtml(message)}</div>
  `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateLobbyPlayers(players) {
  lobbyPlayers.innerHTML = "";

  players.forEach((player) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "lobby-player";
    playerDiv.textContent = `✓ ${player.name}`;
    lobbyPlayers.appendChild(playerDiv);
  });

  if (players.length >= 2 && gameState.isRoomCreator) {
    startGameButton.disabled = false;
  } else if (gameState.isRoomCreator) {
    startGameButton.disabled = true;
  }
}

function updatePlayersList(players) {
  playersListContainer.innerHTML = "";

  players.forEach((player) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "player-item";

    if (gameState.currentPlayer && player.id === gameState.currentPlayer.id) {
      playerDiv.classList.add("current-turn");
    }

    if (!player.isAlive) {
      playerDiv.classList.add("eliminated");
    }

    playerDiv.innerHTML = `
      <strong>${player.name}</strong><br/>
      Status: ${player.isAlive ? "✓ Alive" : "✗ Eliminated"}<br/>
      Body Parts: ${player.totalBodyParts}
    `;

    playersListContainer.appendChild(playerDiv);
  });
}

function updateMyBoxes() {
  if (!gameState.myState) return;

  const myBoxesDiv = document.getElementById("myBoxes");
  if (!myBoxesDiv) return;

  myBoxesDiv.innerHTML = "";

  const ODD_NUMBERS = [1, 3, 5, 7, 9];

  ODD_NUMBERS.forEach((num) => {
    const box = gameState.myState.boxes[num];
    const boxDiv = document.createElement("div");
    boxDiv.className = "box";

    if (box.disabled) boxDiv.classList.add("disabled");

    let contentHTML = '<div class="box-content-visual">';

    contentHTML += `<div class="box-stage">Stage ${box.stage}</div>`;

    if (box.bodyParts.includes("Face")) {
      contentHTML +=
        '<div class="content-item"><div class="box-face active">😊</div><div class="content-label">Face</div></div>';
    }
    if (box.bodyParts.includes("Full Body")) {
      contentHTML +=
        '<div class="content-item"><div class="box-body">🧍</div><div class="content-label">Body</div></div>';
    }
    if (box.bullets > 0) {
      let bullets = "";
      for (let i = 0; i < box.bullets; i++) {
        bullets += '<span class="bullet-icon">🔴</span>';
      }
      contentHTML += `<div class="content-item"><div class="bullets-visual">${bullets}</div><div class="content-label">Bullets</div></div>`;
    }

    let stageDots = '<div class="stage-indicator">';
    for (let i = 1; i <= 5; i++) {
      stageDots += `<div class="stage-dot ${i <= box.stage ? "filled" : ""}"></div>`;
    }
    stageDots += "</div>";
    contentHTML += stageDots;

    if (box.disabled) {
      contentHTML += '<div class="disabled-visual">🚫 DISABLED</div>';
    }
    contentHTML += "</div>";

    boxDiv.innerHTML = `
      <div class="box-number">${num}</div>
      ${contentHTML}
    `;

    boxDiv.classList.add("box-update");
    setTimeout(() => boxDiv.classList.remove("box-update"), 400);

    myBoxesDiv.appendChild(boxDiv);
  });
}

function updateCurrentTurn() {
  if (gameState.currentPlayer) {
    currentTurnDisplay.innerHTML = `
      <strong>Current Turn:</strong> ${gameState.currentPlayer.name}
      ${gameState.currentPlayer.id === gameState.playerId ? " (YOU)" : ""}
    `;
  }
}

function switchScreen(screen) {
  loginScreen.style.display = screen === "login" ? "block" : "none";
  lobbyScreen.style.display = screen === "lobby" ? "block" : "none";
  gameScreen.style.display = screen === "game" ? "block" : "none";
}

function addLog(message, important = false) {
  const logEntry = document.createElement("div");
  logEntry.className = important ? "log-entry important" : "log-entry";
  logEntry.textContent = message;
  gameLog.appendChild(logEntry);
  gameLog.scrollTop = gameLog.scrollHeight;
}
