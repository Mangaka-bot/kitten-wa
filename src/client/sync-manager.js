import { listSessions } from '#auth.js';
import { ClientRegistry } from './registry.js';

/**
 * Restores a specific session in the background.
 *
 * @param {string|number} sessionId - Session identifier to restore
 * @param {any} ClientClass - The Client class constructor
 * @returns {Promise<boolean>} True if restored, false if already active
 */
export async function restoreSession(sessionId, ClientClass) {
  if (ClientRegistry.has(sessionId)) {
    return false;
  }

  const client = new ClientClass({
    id: sessionId,
    silent: true,
    sync: true,
    maxRetries: 3,
  });

  await client.connect();
  return true;
}

/**
 * Synchronizes and restores all other existing sessions in the background.
 *
 * @param {object} params
 * @param {string|number} params.currentId - The current active client session ID
 * @param {string} params.flag - Logging tag
 * @param {object} params.logger - Logger instance
 * @param {any} params.ClientClass - The Client class constructor
 */
export async function syncOtherSessions({ currentId, flag, logger, ClientClass }) {
  if (ClientRegistry.isSyncing) return;
  ClientRegistry.isSyncing = true;

  try {
    const allSessionIds = listSessions();
    const otherSessionIds = allSessionIds.filter((id) => id !== currentId);

    if (otherSessionIds.length === 0) {
      logger.debug(`[${flag}] No other sessions to sync`);
      return;
    }

    logger.debug(
      `[${flag}] Syncing ${otherSessionIds.length} other session(s) in background`
    );

    const results = await Promise.allSettled(
      otherSessionIds.map((sessionId) => restoreSession(sessionId, ClientClass))
    );

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === true) successCount++;
        else skipCount++;
      } else {
        failCount++;
      }
    }

    logger.debug(
      `[${flag}] Session sync complete: ${successCount} restored, ${skipCount} skipped, ${failCount} failed`
    );
  } catch (err) {
    logger.error(err, `[${flag}] Error during session sync`);
  } finally {
    ClientRegistry.isSyncing = false;
  }
}

