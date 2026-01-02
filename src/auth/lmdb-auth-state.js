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
  return db.transaction(() => {
    const id = (db.get(COUNTER_KEY) ?? 0) + 1;
    db.put(COUNTER_KEY, id);
    return id;
  });
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

  const writeCreds = async (credsData) => {
    await db.put(keys.creds, serialize(credsData));
  };

  const getKeys = (type, ids) => {
    if (!ids.length) return {};

    const keyList = ids.map((id) => keys.forKey(type, id));
    const values = db.getMany(keyList);

    const result = {};
    for (let i = 0; i < ids.length; i++) {
      const rawValue = values[i];

      if (rawValue) {
        try {
          let parsed = deserialize(rawValue);
          if (type === "app-state-sync-key" && parsed) {
            parsed = proto.Message.AppStateSyncKeyData.fromObject(parsed);
          }
          result[ids[i]] = parsed;
        } catch (err) {
          logger.error(
            err,
            `[LMDBAuthState] Deserialize error: ${type}:${ids[i]}`
          );
          db.remove(keys.forKey(type, ids[i]));
        }
      }
    }
    return result;
  };

  const setKeys = async (data) => {
    await db.batch(() => {
      for (const [category, categoryData] of Object.entries(data)) {
        if (!categoryData) continue;
        for (const [id, value] of Object.entries(categoryData)) {
          const key = keys.forKey(category, id);
          if (value != null) {
            db.put(key, serialize(value));
          } else {
            db.remove(key);
          }
        }
      }
    });
  };

  const clearKeys = async () => {
    let count = 0;
    await db.batch(() => {
      for (const { key } of db.getRange({
        start: keys.sessionPrefix,
        end: `${keys.sessionPrefix}\xFF`,
      })) {
        if (key !== keys.creds) {
          db.remove(key);
          count++;
        }
      }
    });
    logger.debug(`[LMDBAuthState] Cleared ${count} keys`);
  };

  const deleteSession = async () => {
    await db.batch(() => {
      for (const { key } of db.getRange({
        start: keys.sessionPrefix,
        end: `${keys.sessionPrefix}\xFF`,
      })) {
        db.remove(key);
      }
      db.remove(`${SESSION_PREFIX}${sessionId}`);
    });

    logger.debug(`[LMDBAuthState] Deleted session ${sessionId}`);
  };

  const creds = await db.transaction(() => {
    const existing = db.get(keys.creds);
    if (existing != null) {
      return deserialize(existing);
    }

    const newCreds = initAuthCreds();
    db.put(keys.creds, serialize(newCreds));
    db.put(`${SESSION_PREFIX}${sessionId}`, true);
    return newCreds;
  });

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