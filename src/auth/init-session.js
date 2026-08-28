import { makeWASocket, fetchLatestWaWebVersion } from "baileys";
import { useLMDBAuthState } from "./lmdb-auth-state.js";
import { getConfig } from "#internals.js";

const config = await getConfig();
let cachedWaVersion = null;

const getWaVersion = async () => {
  if (!cachedWaVersion) {
    try {
      const { version } = await fetchLatestWaWebVersion();
      cachedWaVersion = version;
    } catch {/* noop */}
  }
  return cachedWaVersion;
};

export const initSession = async ({ socketConfig, id } = {}) => {
  try {
    const { state, saveCreds, session } = await useLMDBAuthState(id);
    const version = (await getWaVersion()) || config.socket?.version;

    const sock = makeWASocket({
      version: version || undefined,
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