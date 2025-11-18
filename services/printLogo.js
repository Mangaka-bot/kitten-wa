import figlet from "figlet";
import gradient from "gradient-string";
import { asciiArts, alignedLog, picRand } from "#helpers.js";

const {
  TITLE_GRADIENT,
  BOT_NAM,
  AUTHOR_NAM,
  VERSION
} = globalThis;

const Gradient = gradient(TITLE_GRADIENT);

const Title = figlet.textSync(BOT_NAM, {
  font: "ANSI Shadow",
  width: process.stdout.columns,
  whitespaceBreak: true
}).trim()

console.clear()
const ASCII = Gradient(picRand(asciiArts));
const title = Gradient(Title);
const author = Gradient("> By: " + AUTHOR_NAM.toUpperCase());
const version = Gradient("> Version: " + VERSION);
alignedLog(ASCII);
alignedLog([title, author, version].join("\n"));
console.log("\n\n")