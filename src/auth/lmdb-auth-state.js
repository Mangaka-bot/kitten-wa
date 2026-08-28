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
  const current = db.get(COUNTER_KEY);
  let id;
  if (current == null) {
    const existing = listSessions();
    id = existing.length > 0 ? Math.max(...existing) + 1 : 0;
  } else {
    id = current + 1;
  }
  await db.put(COUNTER_KEY, id);
  return id;
};

const getSessionId = async (db, input) => {
  if (input == null) {
    const existing = listSessions();
    if (existing.length > 0) {
      return existing[0];
    }
    return genID(db);
  }
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
  let creds = null;
  let isNew = false;

  if (existingCreds != null) {
    try {
      creds = deserialize(existingCreds);
    } catch {
      logger.warn(`[LMDBAuthState] Corrupted credentials for session ${sessionId}, purging session`);
      creds = null;
    }

    if (creds && (creds.registered || creds.me)) {
      await db.put(`${SESSION_PREFIX}${sessionId}`, true);
    } else {
      // Credentials not registered or corrupted: clean up old session keys and start fresh
      for (const { key } of db.getRange({
        start: keys.sessionPrefix,
        end: `${keys.sessionPrefix}\xFF`,
      })) {
        await db.remove(key);
      }
      await db.remove(`${SESSION_PREFIX}${sessionId}`);
      creds = initAuthCreds();
      await db.put(keys.creds, serialize(creds));
      isNew = true;
    }
  } else {
    creds = initAuthCreds();
    await db.put(keys.creds, serialize(creds));
    isNew = true;
  }

  const writeCreds = async (credsData) => {
    await db.put(keys.creds, serialize(credsData));
    if (credsData?.registered || credsData?.me) {
      await db.put(`${SESSION_PREFIX}${sessionId}`, true);
    }
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
      isNew,
    },
  };
}

export function listSessions() {
  const { db } = LMDBManager;
  if (!db) return [];

  const sessions = new Set();

  for (const { key } of db.getRange({
    start: SESSION_PREFIX,
    end: `${SESSION_PREFIX}\xFF`,
  })) {
    const id = parseInt(key.slice(SESSION_PREFIX.length), 10);
    if (!isNaN(id)) {
      const rawCreds = db.get(`${KEY_PREFIX}:${id}:creds`);
      if (rawCreds != null) {
        try {
          const creds = deserialize(rawCreds);
          if (creds?.registered || creds?.me) {
            sessions.add(id);
          } else {
            db.remove(key);
          }
        } catch {
          db.remove(key);
        }
      } else {
        db.remove(key);
      }
    }
  }

  // Also check for existing credentials as fallback
  for (const { key, value } of db.getRange({
    start: `${KEY_PREFIX}:`,
    end: `${KEY_PREFIX}:\xFF`,
  })) {
    if (key.endsWith(':creds')) {
      const parts = key.split(':');
      if (parts.length === 3 && parts[0] === KEY_PREFIX && parts[2] === 'creds') {
        const id = parseInt(parts[1], 10);
        if (!isNaN(id) && !sessions.has(id)) {
          try {
            const creds = deserialize(value);
            if (creds?.registered || creds?.me) {
              sessions.add(id);
              db.put(`${SESSION_PREFIX}${id}`, true);
            }
          } catch {
            /* ignore corrupted creds */
          }
        }
      }
    }
  }

  return [...sessions].sort((a, b) => a - b);
}

export function sessionExists(sessionId) {
  if (!Number.isInteger(sessionId) || sessionId < 0) return false;
  const { db } = LMDBManager;
  if (!db) return false;

  const rawCreds = db.get(`${KEY_PREFIX}:${sessionId}:creds`);
  if (rawCreds != null) {
    try {
      const creds = deserialize(rawCreds);
      if (creds?.registered || creds?.me) {
        db.put(`${SESSION_PREFIX}${sessionId}`, true);
        return true;
      }
    } catch {
      db.remove(`${SESSION_PREFIX}${sessionId}`);
      return false;
    }
  }
  db.remove(`${SESSION_PREFIX}${sessionId}`);
  return false;
}