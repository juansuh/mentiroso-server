import { FrontendPlayer, Player } from "./models";

export function convertPlayersListBackendToFrontend(
  players: Player[]
): FrontendPlayer[] {
  return players.map((player) => ({
    name: player.name,
    remainingDice: player.dice.length,
  }));
}

export function rollDice(): number {
  return 1 + Math.floor(Math.random() * 6);
}

export function checkNameCollision(name: string, players: string[]) {
  let success = false;
  let newName = name;
  for (let i = 2; !success; i++) {
    if (players.includes(newName)) {
      newName = name + "(" + i + ")";
    } else {
      success = true;
    }
  }
  return newName;
}

//so that index matches dice value (dont store dice 2 at 1)
export function sumAllDice(
  players: Player[]
): [0, number, number, number, number, number, number] {
  const allDice = players.map((player) => player.dice).flat();
  const wilds = allDice.filter((dice) => dice === 1).length;
  return [
    0,
    0,
    allDice.filter((dice) => dice === 2).length + wilds,
    allDice.filter((dice) => dice === 3).length + wilds,
    allDice.filter((dice) => dice === 4).length + wilds,
    allDice.filter((dice) => dice === 5).length + wilds,
    allDice.filter((dice) => dice === 6).length + wilds,
  ];
}
