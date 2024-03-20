import { redis } from "./app";
import { Bet, GameState, Player, RoomState } from "./models";
import { checkNameCollision, rollDice, sumAllDice } from "./utils";

export async function initializeRoom(
  name: string,
  socketId: string
): Promise<{ room: string; err?: string }> {
  const room = await generateRoom();
  const newGame: GameState = {
    room,
    timeLimit: 0,
    roomState: "lobby",
    players: [
      {
        name,
        dice: [],
        id: socketId,
        ready: true,
      },
    ],
    activePlayer: 0,
    bets: [],
    winner: "",
  };

  const dbUpdate = await updateGameState(newGame);
  return { room: newGame.room, err: dbUpdate.err };
}

export async function joinRoom(
  room: string,
  name: string,
  socketId: string
): Promise<{
  name: string;
  players: Player[];
  roomState: RoomState | "";
  err?: string;
}> {
  const game = await fetchGameState(room);

  //if there is a game, we can join it and return state
  if (game) {
    const newName = checkNameCollision(
      name,
      game.players.map((player) => player.name)
    );
    const existingPlayer = game.players.find((player) => player.name === name);
    //if it's started, you need to be rejoining to connect
    if (game.roomState === "game") {
      //if the name exists
      if (existingPlayer) {
        //if that slot is already being occupied by a socket
        if (existingPlayer.id) {
          return {
            name: "",
            players: [],
            roomState: "",
            err: `Someone is already playing as ${name}`,
          };
        }
        //we will connect their socket ID to the existing name if ID is blank, assuming reconnect
        else {
          existingPlayer.id = socketId;
          const dbUpdate = await updateGameState(game);
          return {
            name,
            players: game.players,
            roomState: game.roomState,
            err: dbUpdate.err,
          };
        }
      }
      //the name does not exist
      else {
        return {
          name: "",
          players: [],
          roomState: "",
          err: "Game in progress",
        };
      }
    }
    //it's in the lobby, you are free to join
    else {
      game.players.push({ name: newName, dice: [], id: socketId, ready: true });
      const dbUpdate = await updateGameState(game);
      return {
        name: newName,
        players: game.players,
        roomState: game.roomState,
        err: dbUpdate.err,
      };
    }
  } else {
    return { name: "", players: [], roomState: "", err: "Room not found" };
  }
}

export async function leaveRoom(
  room: string,
  name: string
): Promise<{ players: Player[]; activePlayer: string; err?: string }> {
  const game = await fetchGameState(room);
  if (game) {
    game.players = game.players.filter((player) => player.name !== name);

    const dbUpdate = await updateGameState(game);
    return {
      players: game.players,
      activePlayer: game.players[game.activePlayer]?.name ?? "",
      err: dbUpdate.err,
    };
  } else {
    return { players: [], activePlayer: "", err: "Game not found" };
  }
}

export async function startGame(room: string): Promise<{
  roomState: RoomState | "";
  players: Player[];
  activePlayer: string;
  err?: string;
}> {
  const game = await fetchGameState(room);
  if (game) {
    //give each player 5 dice
    game.players.forEach((player) => {
      player.dice = [
        rollDice(),
        rollDice(),
        rollDice(),
        rollDice(),
        rollDice(),
      ];
    });
    //start the game
    game.roomState = "game";
    const dbUpdate = await updateGameState(game);
    return {
      roomState: game.roomState,
      players: game.players,
      activePlayer: game.players[game.activePlayer].name,
      err: dbUpdate.err,
    };
  } else {
    return {
      roomState: "",
      players: [],
      activePlayer: "",
      err: "Error starting game",
    };
  }
}

export async function raiseBet(
  room: string,
  bet: Bet
): Promise<{
  bets: Bet[];
  activePlayer: string;
  err?: string;
}> {
  const game = await fetchGameState(room);
  if (game) {
    //add bet to bet history
    game.bets = [...game.bets, bet];

    //next active player
    let validActivePlayer = false;
    while (!validActivePlayer) {
      //end of players list, back to 0
      if (game.activePlayer >= game.players.length - 1) {
        game.activePlayer = 0;
      }
      //increment by 1
      else {
        game.activePlayer = game.activePlayer + 1;
      }

      //if they still have dice they can play
      if (game.players[game.activePlayer].dice.length > 0) {
        validActivePlayer = true;
      }
    }

    const dbUpdate = await updateGameState(game);

    return {
      bets: game.bets,
      activePlayer: game.players[game.activePlayer].name,
      err: dbUpdate.err,
    };
  } else {
    return {
      bets: [],
      activePlayer: "",
      err: "Error finding game",
    };
  }
}

export async function showDice(
  room: string,
  name: string
): Promise<{
  winner: string;
  playersRevealed: { name: string; dice: number[] }[];
  err?: string;
}> {
  const game = await fetchGameState(room);
  if (game) {
    const lastBet = game.bets[game.bets.length - 1];
    const challenger = game.players.find((player) => player.name === name);
    const bluffer = game.players.find(
      (player) => player.name === lastBet.player
    );
    if (challenger && bluffer) {
      const diceCounts = sumAllDice(game.players);

      const playersRevealed = game.players.map((player) => ({
        name: player.name,
        dice: [...player.dice],
      }));

      //grant winner title, remove dice from loser
      let winner;
      if (diceCounts[lastBet.value] >= lastBet.count) {
        winner = bluffer.name;
        challenger.dice.pop();
      } else {
        winner = challenger.name;
        bluffer.dice.pop();
      }
      game.winner = winner;

      //Set all players ready to false until next round
      game.players.forEach((player) => (player.ready = false));

      const dbUpdate = await updateGameState(game);

      return {
        winner: game.winner,
        playersRevealed,
        err: dbUpdate.err,
      };
    } else {
      return {
        winner: "",
        playersRevealed: [],
        err: "Could not find players",
      };
    }
  } else {
    return {
      winner: "",
      playersRevealed: [],
      err: "Error finding game",
    };
  }
}

export async function togglePlayerReady(
  room: string,
  name: string
): Promise<{
  allPlayersReady: boolean;
  err?: string;
}> {
  const game = await fetchGameState(room);
  if (game) {
    const player = game.players.find((player) => player.name === name);
    if (player) {
      player.ready = true;
      const allPlayersReady =
        game.players.filter((player) => player.ready === false).length === 0;
      const dbUpdate = await updateGameState(game);
      return {
        allPlayersReady,
        err: dbUpdate.err,
      };
    } else {
      return {
        allPlayersReady: false,
        err: "Could not find player",
      };
    }
  } else {
    return {
      allPlayersReady: false,
      err: "Could not find game",
    };
  }
}

export async function newRound(room: string): Promise<{
  activePlayer: string;
  bets: Bet[];
  winner: string;
  players: Player[];
  err?: string;
}> {
  const game = await fetchGameState(room);
  if (game) {
    const roundNumber =
      game.players.length * 5 -
      game.players.map((player) => player.dice).flat().length;

    game.activePlayer = roundNumber % game.players.length;
    game.bets = [];
    game.winner = "";
    game.players.forEach((player) => {
      player.dice = player.dice.map(() => rollDice());
    });

    const dbUpdate = await updateGameState(game);

    return {
      activePlayer: game.players[game.activePlayer].name,
      bets: game.bets,
      winner: game.winner,
      players: game.players,
      err: dbUpdate.err,
    };
  } else {
    return {
      activePlayer: "",
      bets: [],
      winner: "",
      players: [],
      err: "Could not find game",
    };
  }
}

async function fetchGameState(room: string): Promise<GameState | undefined> {
  const game: string | null = await redis.get(room);
  if (game) {
    return JSON.parse(game);
  }
  return;
}

async function updateGameState(game: GameState): Promise<{ err: string }> {
  const ok = await redis.set(game.room, JSON.stringify(game), "EX", 3600);

  return { err: ok === "OK" ? "" : "Failed to update game" };
}

async function generateRoom() {
  let success = false;
  let room = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  while (!success) {
    for (let i = 0; i < 4; i++) {
      room += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const existingRoom = await redis.get(room);
    if (!existingRoom) {
      success = true;
    } else {
      room = "";
    }
  }
  return room;
}
