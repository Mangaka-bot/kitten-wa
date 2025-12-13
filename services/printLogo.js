import figlet from "figlet";
import gradient from "gradient-string";
import config from "config";
import { asciiArts, alignedLog, picRand } from "#helpers.js";


const { titleGradient } = config.bot;
const botName = config.bot.name;
const authorName = config.author;
const versionTag = config.version;

const Gradient = gradient(titleGradient);

const Title = figlet.textSync(botName, {
  font: "ANSI Shadow",
  width: process.stdout.columns,
  whitespaceBreak: true
}).trim()

console.clear()
const ASCII = Gradient(picRand(asciiArts));
const title = Gradient(Title);
const author = Gradient("> By: " + authorName.toUpperCase());
const version = Gradient("> Version: " + versionTag);
alignedLog(ASCII);
alignedLog([title, author, version].join("\n"));
console.log("\n\n")