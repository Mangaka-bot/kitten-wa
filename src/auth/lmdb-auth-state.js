import { proto, initAuthCreds } from "baileys";
import { LMDBManager, logger } from "#internals.js";
import { serialize, deserialize } from "#utils.js";

const KEY_PREFIX = "baileys";
const COUNTER_KEY = `${KEY_PREFIX}:__meta__:counter`;
const SESSION_PREFIX = `${KEY_PREFIX}:__sessions__:`;

const keyBuilder = (sessionId) => {
  const prefix = `${KEY_PREFIX}:${sessionId}:`;
  return {
    sessionId,
    sessionPrefix: prefix,
    creds: `${prefix}creds`,
    forKey: (type, id) => `${prefix}${type}:${id}`,
  };
};

const genID = async (db) => {
  const id = (db.get(COUNTER_KEY) ?? 0) + 1;
  await db.put(COUNTER_KEY, id);
  return id;
};

const getSessionId = async (db, input) => {
  if (input == null) return genID(db);
  if (Number.isInteger(input) && input >= 0) return input;
  throw new TypeError(
    'Invalid sessionId: expected null/undefined or non-negative integer'
  );
};

export async function useLMDBAuthState(inputSessionId) {
  const { db } = LMDBManager;
  const sessionId = await getSessionId(db, inputSessionId);
  const keys = keyBuilder(sessionId);

  const existingCreds = db.get(keys.creds);
  let creds;
  
  if (existingCreds != null) {
    creds = deserialize(existingCreds);
  } else {
    creds = initAuthCreds();
    await db.put(keys.creds, serialize(creds));
    await db.put(`${SESSION_PREFIX}${sessionId}`, true);
  }

  const writeCreds = async (credsData) => {
    await db.put(keys.creds, serialize(credsData));
  };

  const getKeys = (type, ids) => {
    if (!ids.length) return {};

    const result = {};
    for (const id of ids) {
      const dbKey = keys.forKey(type, id);
      const rawValue = db.get(dbKey);

      if (rawValue != null) {
        try {
          let parsed = deserialize(rawValue);
          if (type === "app-state-sync-key" && parsed) {
            parsed = proto.Message.AppStateSyncKeyData.fromObject(parsed);
          }
          result[id] = parsed;
        } catch (err) {
          logger.error(
            err,
            `[LMDBAuthState] Deserialize error: ${type}:${id}`
          );
          result[id] = null;
        }
      } else {
        result[id] = null;
      }
    }
    return result;
  };

  const setKeys = async (data) => {
    const writes = [];
    
    for (const [category, categoryData] of Object.entries(data)) {
      if (!categoryData) continue;
      for (const [id, value] of Object.entries(categoryData)) {
        const key = keys.forKey(category, id);
        if (value != null) {
          writes.push(db.put(key, serialize(value)));
        } else {
          writes.push(db.remove(key));
        }
      }
    }
    
    if (writes.length > 0) {
      await Promise.all(writes);
    }
  };

  const clearKeys = async () => {
    let count = 0;
    const writes = [];
    
    for (const { key } of db.getRange({
      start: keys.sessionPrefix,
      end: `${keys.sessionPrefix}\xFF`,
    })) {
      if (key !== keys.creds) {
        writes.push(db.remove(key));
        count++;
      }
    }
    
    if (writes.length > 0) {
      await Promise.all(writes);
    }
    logger.debug(`[LMDBAuthState] Cleared ${count} keys`);
  };

  const deleteSession = async () => {
    const writes = [];
    
    for (const { key } of db.getRange({
      start: keys.sessionPrefix,
      end: `${keys.sessionPrefix}\xFF`,
    })) {
      writes.push(db.remove(key));
    }
    writes.push(db.remove(`${SESSION_PREFIX}${sessionId}`));
    
    await Promise.all(writes);
    logger.debug(`[LMDBAuthState] Deleted session ${sessionId}`);
  };

  return {
    state: {
      creds,
      keys: {
        get: getKeys,
        set: setKeys,
        clear: clearKeys,
      },
    },
    saveCreds: () => writeCreds(creds),
    session: {
      delete: deleteSession,
      clear: clearKeys,
      id: sessionId,
    },
  };
}

export function listSessions() {
  if (!LMDBManager.isOpen) return [];

  const { db } = LMDBManager;
  const sessions = [];

  for (const { key } of db.getRange({
    start: SESSION_PREFIX,
    end: `${SESSION_PREFIX}\xFF`,
  })) {
    const id = parseInt(key.slice(SESSION_PREFIX.length), 10);
    if (!isNaN(id)) sessions.push(id);
  }

  return sessions.sort((a, b) => a - b);
}

export function sessionExists(sessionId) {
  if (!Number.isInteger(sessionId) || sessionId < 0 || !LMDBManager.isOpen)
    return false;
  const { db } = LMDBManager;
  return db.get(`${SESSION_PREFIX}${sessionId}`) != null;
}