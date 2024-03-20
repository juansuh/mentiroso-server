export interface GameState {
  room: string;
  timeLimit: number;
  roomState: RoomState;
  players: Player[];
  activePlayer: number;
  bets: Bet[];
  winner: string;
}

export type RoomState = "lobby" | "game";

export interface Bet {
  player: string;
  count: number;
  value: number;
}

export interface Player {
  id: string;
  name: string;
  dice: number[];
  ready: boolean;
}

export interface FrontendPlayer {
  name: string;
  remainingDice: number;
}
