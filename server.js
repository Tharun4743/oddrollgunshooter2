const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.static("public"));
app.use(express.json());

const gameRooms = new Map();
const playerSockets = new Map();
const ODD_NUMBERS = [1, 3, 5, 7, 9];

class GameRoom {
  constructor(roomKey, maxPlayers) {
    this.roomKey = roomKey;
    this.maxPlayers = maxPlayers || 6;
    this.players = new Map();
    this.currentTurnIndex = 0;
    this.gameStarted = false;
    this.winner = null;
  }

  addPlayer(socketId, playerName) {
    if (this.players.size >= this.maxPlayers) return false;
    if (!playerName || playerName.trim().length === 0) return false;

    this.players.set(socketId, {
      id: socketId,
      name: playerName.substring(0, 20),
      boxes: {
        1: { stage: 0, bodyParts: [], bullets: 0, disabled: false },
        3: { stage: 0, bodyParts: [], bullets: 0, disabled: false },
        5: { stage: 0, bodyParts: [], bullets: 0, disabled: false },
        7: { stage: 0, bodyParts: [], bullets: 0, disabled: false },
        9: { stage: 0, bodyParts: [], bullets: 0, disabled: false },
      },
      isAlive: true,
      totalBodyParts: 0,
      mustShoot: false,
    });
    return true;
  }

  removePlayer(socketId) {
    return this.players.delete(socketId);
  }

  getPlayersList() {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isAlive: p.isAlive,
      totalBodyParts: p.totalBodyParts,
    }));
  }

  getCurrentPlayer() {
    const alivePlayers = Array.from(this.players.values()).filter((p) => p.isAlive);
    if (alivePlayers.length === 0) return null;
    if (this.currentTurnIndex >= alivePlayers.length) this.currentTurnIndex = 0;
    return alivePlayers[this.currentTurnIndex];
  }

  processRoll(socketId, rolledNumber) {
    const player = this.players.get(socketId);
    if (!player || !player.isAlive)
      return { success: false, message: "Player not found or eliminated" };
    const box = player.boxes[rolledNumber];
    if (!box) return { success: false, message: "Invalid box number" };
    if (box.disabled)
      return {
        success: false,
        message: `❌ Box ${rolledNumber} is DISABLED! Cannot roll here.`,
        box,
      };
    if (player.mustShoot)
      return { success: false, message: `⚠️ You MUST SHOOT first before rolling again!`, box };

    box.stage++;
    let result = { success: true, message: "", box, canShoot: false };
    if (box.stage === 1 && !box.bodyParts.includes("Face")) {
      box.bodyParts.push("Face");
      player.totalBodyParts++;
      result.message = `✨ Face appeared in box ${rolledNumber}!`;
    } else if (box.stage === 2 && !box.bodyParts.includes("Full Body")) {
      box.bodyParts.push("Full Body");
      player.totalBodyParts++;
      result.message = `✨ Full Body appeared in box ${rolledNumber}!`;
    } else if (box.stage === 3) {
      box.bullets = 1;
      result.message = `🔫 Gun with 1 bullet in box ${rolledNumber}!`;
    } else if (box.stage === 4) {
      box.bullets = 2;
      result.message = `🔫 Gun upgraded to 2 bullets in box ${rolledNumber}!`;
    } else if (box.stage >= 5) {
      box.bullets = 3;
      player.mustShoot = true;
      result.canShoot = true;
      result.message = `⚡ FULLY LOADED: 3 bullets! YOU MUST SHOOT NOW!`;
    }
    return result;
  }

  shootPlayer(shooterId, targetId, disableNumber) {
    const shooter = this.players.get(shooterId);
    const target = this.players.get(targetId);

    if (!shooter || !shooter.isAlive) return { success: false, message: "Shooter not found" };
    if (!target || !target.isAlive) return { success: false, message: "Target not alive" };
    if (shooterId === targetId) return { success: false, message: "Cannot shoot yourself!" };
    if (![1, 3, 5, 7, 9].includes(disableNumber))
      return { success: false, message: "Invalid number" };

    let shotBox = null;
    for (const num of ODD_NUMBERS) {
      if (shooter.boxes[num].bullets === 3) {
        shotBox = shooter.boxes[num];
        break;
      }
    }

    if (!shotBox) return { success: false, message: "No 3-bullet gun found!" };

    shotBox.bullets = 0;
    shooter.mustShoot = false;

    if (target.boxes[disableNumber].disabled)
      return { success: false, message: `Box ${disableNumber} already disabled!` };

    target.boxes[disableNumber].disabled = true;

    return {
      success: true,
      message: `💥 ${target.name}'s box ${disableNumber} DISABLED!`,
      targetName: target.name,
      disabledBox: disableNumber,
    };
  }

  autoAdvanceTurn() {
    const alivePlayers = Array.from(this.players.values()).filter((p) => p.isAlive);

    if (alivePlayers.length <= 1) {
      this.winner = alivePlayers[0] || null;
      return null;
    }

    this.currentTurnIndex++;
    if (this.currentTurnIndex >= alivePlayers.length) {
      this.currentTurnIndex = 0;
    }

    return this.getCurrentPlayer();
  }

  checkWinner() {
    const alivePlayers = Array.from(this.players.values()).filter((p) => p.isAlive);

    if (alivePlayers.length === 1) {
      this.winner = alivePlayers[0];
      return this.winner;
    }

    return null;
  }

  cleanupRoom() {
    if (this.players.size === 0) {
      return true;
    }
    return false;
  }
}

io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  socket.on("joinRoom", ({ roomKey, playerName, maxPlayers }) => {
    try {
      if (!roomKey || !playerName) {
        socket.emit("joinFailed", { message: "Invalid room or player name" });
        return;
      }

      let room = gameRooms.get(roomKey);
      if (!room) {
        room = new GameRoom(roomKey, maxPlayers || 6);
        gameRooms.set(roomKey, room);
      }

      const joined = room.addPlayer(socket.id, playerName);

      if (joined) {
        socket.join(roomKey);
        socket.roomKey = roomKey;
        playerSockets.set(socket.id, { roomKey, playerName });

        console.log(`✅ ${playerName} joined room ${roomKey}`);

        io.to(roomKey).emit("playerJoined", {
          players: room.getPlayersList(),
          currentPlayer: room.getCurrentPlayer(),
        });

        socket.emit("joinSuccess", {
          roomKey,
          playerId: socket.id,
          players: room.getPlayersList(),
        });
      } else {
        socket.emit("joinFailed", { message: "Room is full!" });
      }
    } catch (error) {
      console.error("Error in joinRoom:", error);
      socket.emit("joinFailed", { message: "Server error" });
    }
  });

  socket.on("startGame", () => {
    try {
      const room = gameRooms.get(socket.roomKey);
      if (!room) return;

      if (room.players.size < 2) {
        socket.emit("joinFailed", { message: "Need at least 2 players" });
        return;
      }

      room.gameStarted = true;
      io.to(socket.roomKey).emit("gameStarted", {
        currentPlayer: room.getCurrentPlayer(),
        players: room.getPlayersList(),
      });
    } catch (error) {
      console.error("Error in startGame:", error);
    }
  });

  socket.on("rollDice", () => {
    try {
      const room = gameRooms.get(socket.roomKey);
      if (!room || !room.gameStarted) return;

      const currentPlayer = room.getCurrentPlayer();
      if (!currentPlayer || currentPlayer.id !== socket.id) {
        socket.emit("notYourTurn", { message: "⏸️ Not your turn!" });
        return;
      }

      const rolledNumber = ODD_NUMBERS[Math.floor(Math.random() * ODD_NUMBERS.length)];
      const result = room.processRoll(socket.id, rolledNumber);

      io.to(socket.roomKey).emit("diceRolled", {
        playerId: socket.id,
        playerName: currentPlayer.name,
        rolledNumber,
        result,
        currentPlayerState: room.players.get(socket.id),
      });
    } catch (error) {
      console.error("Error in rollDice:", error);
    }
  });

  socket.on("shootPlayer", ({ targetId, disableNumber }) => {
    try {
      const room = gameRooms.get(socket.roomKey);
      if (!room || !room.gameStarted) return;

      const result = room.shootPlayer(socket.id, targetId, disableNumber);

      if (result.success) {
        io.to(socket.roomKey).emit("playerShot", {
          shooterId: socket.id,
          targetId,
          disabledBox: disableNumber,
          message: result.message,
          updatedPlayers: room.getPlayersList(),
        });

        const target = room.players.get(targetId);
        if (target) {
          const allBoxesDisabled = [1, 3, 5, 7, 9].every((num) => target.boxes[num].disabled);
          if (allBoxesDisabled) {
            target.isAlive = false;
          }
        }

        const winner = room.checkWinner();
        if (winner) {
          io.to(socket.roomKey).emit("gameOver", {
            winner,
          });
        } else {
          const nextPlayer = room.autoAdvanceTurn();
          if (nextPlayer) {
            io.to(socket.roomKey).emit("turnChanged", {
              currentPlayer: nextPlayer,
              players: room.getPlayersList(),
            });
          }
        }
      } else {
        socket.emit("shootFailed", { message: result.message });
      }
    } catch (error) {
      console.error("Error in shootPlayer:", error);
    }
  });

  socket.on("sendChat", ({ message }) => {
    try {
      const playerData = playerSockets.get(socket.id);
      if (!playerData) return;

      const sanitized = message.trim().substring(0, 200);
      if (!sanitized) return;

      io.to(playerData.roomKey).emit("chatMessage", {
        playerId: socket.id,
        playerName: playerData.playerName,
        message: sanitized,
      });
    } catch (error) {
      console.error("Error in sendChat:", error);
    }
  });

  socket.on("getGameState", () => {
    try {
      const room = gameRooms.get(socket.roomKey);
      if (!room) return;

      socket.emit("gameState", {
        players: room.getPlayersList(),
        currentPlayer: room.getCurrentPlayer(),
        myState: room.players.get(socket.id),
      });
    } catch (error) {
      console.error("Error in getGameState:", error);
    }
  });

  socket.on("disconnect", () => {
    try {
      if (socket.roomKey) {
        const room = gameRooms.get(socket.roomKey);
        if (room) {
          room.removePlayer(socket.id);

          if (room.cleanupRoom()) {
            gameRooms.delete(socket.roomKey);
            console.log(`🗑️ Room ${socket.roomKey} deleted (empty)`);
          } else {
            io.to(socket.roomKey).emit("playerLeft", {
              players: room.getPlayersList(),
              currentPlayer: room.getCurrentPlayer(),
            });
          }
        }
      }

      playerSockets.delete(socket.id);
      console.log(`❌ Client disconnected: ${socket.id}`);
    } catch (error) {
      console.error("Error in disconnect:", error);
    }
  });

  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`\n🎲 Odd Roll Showdown Running!`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`⚙️  Engine: Node.js + Express + Socket.io\n`);
});
