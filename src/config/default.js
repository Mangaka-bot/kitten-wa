import { Browsers } from "baileys";
import pino from "pino";

const socket = {
  browser: Browsers.ubuntu('Chrome'),
  markOnlineOnConnect: false,
  syncFullHistory: false,
  generateHighQualityLinkPreview: true,
  shouldIgnoreJid: () => false,
  shouldSyncHistoryMessage: () => false,
  logger: pino({ level: "silent" }),
}

const db = {
  path: './db',
  compression: true,
  mapSize: 2 * 1024 * 1024 * 1024, // 2 GB
  maxReaders: 126,
  noSync: false,
  noMetaSync: false,
};

export default {
  db,
  socket
}