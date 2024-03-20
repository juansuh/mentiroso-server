import { server } from "./app";
import { Server } from "socket.io";
import {
  initializeRoom,
  joinRoom,
  leaveRoom,
  newRound,
  raiseBet,
  showDice,
  startGame,
  togglePlayerReady,
} from "./db";
import { convertPlayersListBackendToFrontend } from "./utils";
import { Bet, Player } from "./models";

const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

io.engine.on("connection_error", (err) => {
  console.log(err.req); // the request object
  console.log(err.code); // the error code, for example 1
  console.log(err.message); // the error message, for example "Session ID unknown"
  console.log(err.context); // some additional error context
});

io.on("connection", (socket) => {
  console.log("Player connected: ", socket.id);

  socket.on("join room", async (data: { name: string; room: string }) => {
    const { room, name } = data;
    if (name && room.length === 4) {
      //attempt to join room
      const joined = await joinRoom(room, name, socket.id);

      if (joined.err) {
        socket.emit("error message", joined.err);
      } else {
        //add client's socket to room
        socket.join(room);

        //update client's name and state to lobby
        socket.emit("update name", joined.name);
        socket.emit("update room", room);
        socket.emit("update room state", joined.roomState);

        //update all clients in room with player information
        io.to(room).emit(
          "update players",
          convertPlayersListBackendToFrontend(joined.players)
        );
      }
    } else {
      socket.emit("error message", name ? "Invalid room code" : "Missing name");
    }
  });

  socket.on("create room", async (data: { name: string }) => {
    const { name } = data;
    if (name) {
      //attempt to create room
      const created = await initializeRoom(name, socket.id);
      if (created.err) {
        socket.emit("error message", created.err);
      } else {
        //add client's socket to room
        socket.join(created.room);

        //update client's state to lobby, name, room code, andplayer list
        socket.emit("update room state", "lobby");
        socket.emit("update name", name);
        socket.emit("update room", created.room);
        socket.emit("update players", [{ name, remainingDice: 0 }]);
      }
    } else {
      socket.emit("error message", "Missing name");
    }
  });

  socket.on("leave room", async (data: { name: string; room: string }) => {
    const { room, name } = data;
    if (name && room.length === 4) {
      //attempt to leave room
      const leaving = await leaveRoom(room, name);

      if (leaving.err) {
        socket.emit("error message", leaving.err);
      } else {
        //remove client's socket from room
        socket.leave(room);

        //move client back to join screen
        socket.emit("update room state", "join");

        //update all clients in room with new player list
        io.to(room).emit(
          "update players",
          convertPlayersListBackendToFrontend(leaving.players)
        );
      }
    } else {
      socket.emit("error message", name ? "Invalid room code" : "Missing name");
    }
  });

  socket.on("start game", async (data: { room: string }) => {
    const { room } = data;
    const starting = await startGame(room);
    if (!starting.err) {
      //update all clients in room with new player list, active player, and room state
      io.to(room).emit(
        "update players",
        convertPlayersListBackendToFrontend(starting.players)
      );
      io.to(room).emit("update active player", starting.activePlayer);
      io.to(room).emit("update room state", starting.roomState);
      sendDiceToPlayers(room, starting.players);
    } else {
      socket.emit("error message", starting.err);
    }
  });

  socket.on("raise bet", async (data: { bet: Bet; room: string }) => {
    const { bet, room } = data;

    const raisingBet = await raiseBet(room, bet);
    if (!raisingBet.err) {
      //update all clients in room with new bets and active player
      io.to(room).emit("update bets", raisingBet.bets);
      io.to(room).emit("update active player", raisingBet.activePlayer);
    } else {
      socket.emit("error message", raisingBet.err);
    }
  });

  socket.on("show dice", async (data: { name: string; room: string }) => {
    const { name, room } = data;

    const showingDice = await showDice(room, name);
    if (!showingDice.err) {
      //update all clients in room with winner information
      io.to(room).emit("update winner", showingDice);
    } else {
      socket.emit("error message", showingDice.err);
    }
  });

  socket.on("ready round", async (data: { name: string; room: string }) => {
    const { name, room } = data;

    const sendingReadySignal = await togglePlayerReady(room, name);
    if (!sendingReadySignal.err) {
      if (sendingReadySignal.allPlayersReady) {
        const newRoundData = await newRound(room);

        //update all clients in room with new round information
        sendDiceToPlayers(room, newRoundData.players);
        io.to(room).emit(
          "update players",
          convertPlayersListBackendToFrontend(newRoundData.players)
        );
        io.to(room).emit("update active player", newRoundData.activePlayer);
        io.to(room).emit("update bets", newRoundData.bets);
        io.to(room).emit("update winner", undefined);
      }
    } else {
      socket.emit("error message", sendingReadySignal.err);
    }
  });

  socket.on("disconnecting", () => {});

  function sendDiceToPlayers(room: string, players: Player[]) {
    //Send dice to every player
    const rooms = io.of("/").adapter.rooms;
    rooms.get(room)?.forEach((socketId) => {
      io.to(socketId).emit(
        "update dice",
        players.find((player) => player.id === socketId)?.dice
      );
    });
  }
});
