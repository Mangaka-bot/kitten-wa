import {
  makeWASocket,
  useMultiFileAuthState
} from "baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import chalk from "chalk";
import { loader } from "@shoru/listrx";

import "dotenv/config";
import "./services/plugins-watcher.js";
import "./services/printLogo.js";

import { handleEvents } from "./events.js";
import { getConnectionConfig, handleStatus, sockConfig } from "./connection/index.js";

// Global UI State
const spinner = loader("Connecting to WhatsApp...");
let isConfiguring  = false;
let connConfig;

async function launchBot() {
  spinner.start();

  // session
  const { state, saveCreds } = await useMultiFileAuthState("session");

  // socket configuration
  const sock = makeWASocket(sockConfig(state));

  // auth events
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => connectionLogic(sock, update));

  // other events
  handleEvents(sock);
}

launchBot();

// Main Connection Update Handler
const connectionLogic = async (sock, {connection, lastDisconnect, qr}) => {
  if (!isConfiguring) {
    if (qr) {
      spinner.stop();
      await handleAuth(sock, qr)
    }
  
    if (connection === "close") {
      spinner.color = "green";
      spinner.start();
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      handleStatus(launchBot, statusCode, spinner);
    } else if (connection === "open") {
      spinner.succeed("Bot is connected");
    }
  }
}

// Helper Authentication Method Handler
const handleAuth = async (sock, qr) => {
  if (!connConfig?.type) connConfig = await getAuthConfig();
  if (connConfig.type === "pn") {
    const code = await sock.requestPairingCode(connConfig.pn);
    const message = getCodeMessage(code);
    console.log(message)
  } else {
    qrcode.generate(qr, { small: true });
    process.stdout.write("\n");
  }
}

// Helper to lock connection.update while configuring
const getAuthConfig = async () => {
  isConfiguring  = true;
  const config = await getConnectionConfig();
  isConfiguring  = false;
  return config;
}

// Helper to generate OTP code message
const getCodeMessage = (code) => {
  const formatedCode = code.match(/.{1,4}/g).join(" ")
  const boldCode = chalk.bold(formatedCode);
  const prefix = chalk.green("> Your OTP Code: ");
  return "\n" + prefix + boldCode;
}