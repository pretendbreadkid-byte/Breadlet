const words = [
  "bread", "butter", "toaster", "bakery", "crumb", "yeast", "flour", "sourdough", "pretzel", "croissant",
  "bagel", "muffin", "cookie", "pancake", "waffle", "donut", "cupcake", "brownie", "biscuit", "cracker",
  "breadlet", "goodybag", "token", "market", "trade", "legend", "mythic", "shiny", "crafting", "recycle",
  "planet", "rocket", "galaxy", "meteor", "comet", "island", "forest", "jungle", "desert", "volcano",
  "dragon", "wizard", "knight", "castle", "pirate", "treasure", "anchor", "lantern", "compass", "puzzle",
  "monkey", "penguin", "dolphin", "giraffe", "octopus", "panther", "rabbit", "turtle", "parrot", "falcon",
  "rainbow", "thunder", "blizzard", "sunset", "ocean", "river", "mountain", "meadow", "canyon", "glacier",
  "guitar", "piano", "trumpet", "violin", "drummer", "melody", "rhythm", "harmony", "whistle", "chorus",
  "pickle", "banana", "orange", "cherry", "mango", "peach", "lemon", "coconut", "pumpkin", "carrot",
];

const hints = (word: string) => `${word.length} letters, starts with "${word[0].toUpperCase()}"`;

const pick = () => words[Math.floor(Math.random() * words.length)];

// Inserts random commas and periods between the letters, e.g. "w,o.rd".
export function noisyWord(word: string) {
  let output = "";
  Array.from(word).forEach((letter, index) => {
    output += letter;
    if (index < word.length - 1 && Math.random() < 0.6) output += Math.random() < 0.5 ? "," : ".";
  });
  return output.includes(",") || output.includes(".") ? output : `${word[0]},${word.slice(1)}`;
}

export function scrambledWord(word: string) {
  const letters = Array.from(word);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (let index = letters.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [letters[index], letters[other]] = [letters[other], letters[index]];
    }
    if (letters.join("") !== word) break;
  }
  return letters.join("");
}

export function newWordGame(kind: "wordrace" | "unscramble") {
  const answer = pick();
  if (kind === "wordrace") return { answer, display: noisyWord(answer), hint: "" };
  return { answer, display: scrambledWord(answer), hint: hints(answer) };
}
