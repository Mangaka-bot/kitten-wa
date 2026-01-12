import { makeWASocket } from "baileys";
import { useLMDBAuthState } from "./lmdb-auth-state.js";
import { getConfig } from "#internals.js";

const config = await getConfig();

export const initSession = async ({ socketConfig, id } = {}) => {
  try {
    const { state, saveCreds, session } = await useLMDBAuthState(id);
  
    const sock = makeWASocket({ 
      auth: state,
      ...config.socket, 
      ...socketConfig
    });
  
    sock.ev.on("creds.update", saveCreds);

    return { sock, session };
  } catch (err) {
    throw new Error(`[INIT_SESSION] Failed to initialize session: ${err.message}`, { cause: err });
  }
};