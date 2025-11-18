import {
  Browsers,
  makeWASocket,
  useMultiFileAuthState,
} from "baileys";
import p from "pino";
import qrcode from "qrcode-terminal";
import ora from "ora";

import "dotenv/config";
import "./config.js";
import "./services/plugins-watcher.js";
import "./services/printLogo.js"

import { handleEvents } from "./events.js"

const spinner = ora("Connecting to WhatsApp...");

async function launchBot() {
  spinner.start();
  const { state, saveCreds } = await useMultiFileAuthState("session");

  const sock = makeWASocket({
    auth: state,
    markOnlineOnConnect: false,
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: true,
    logger: p({ level: "silent" })
  })

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) {
      console.log("Scan me to connect");
      qrcode.generate(qr, { small: true })
    }

    if (connection === "close") {
      spinner.color = "green";
      spinner.text = "Connection closed, reconnecting...";
      launchBot();
    } else if (connection === "open") 
      spinner.succeed("Bot is connected")
    })

    handleEvents(sock)
  }
  
launchBot();