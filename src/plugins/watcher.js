import { watch } from 'chokidar';
import { logger } from '#internals.js';
import path from 'path';
import { PLUGIN_DIR, debounceMs } from './config.js';
import { handleError } from './handle-error.js';
import { loadFile, getLock, getParentFolder, deleteLockIfUnused } from './loader.js';
import { setPlugin, registerToBuckets, unloadByFilePath } from './registry.js';

let watcher = null;

const debounceTimers = new Map();

let syncCallback = null;

export function onSync(callback) {
  syncCallback = callback;
}

export function initWatcher() {
  if (watcher) return;

  watcher = watch(PLUGIN_DIR, {
    persistent: true,
    ignoreInitial: true,
    ignored: [
      /(^|[/\\])_/,
      /\.d\.[jt]s$/,
      /node_modules/,
      /(^|[/\\])\../
    ],
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 20
    },
  })
    .on('add', p => scheduleHMR(p, 'add'))
    .on('change', p => scheduleHMR(p, 'change'))
    .on('unlink', p => scheduleHMR(p, 'unlink'))
    .on('error', err => handleError('[Watcher]', err));
}

export function closeWatcher() {
  watcher?.close();
  watcher = null;
}

export function clearTimers() {
  debounceTimers.forEach(clearTimeout);
  debounceTimers.clear();
}

function scheduleHMR(filePath, type) {
  const resolved = path.resolve(filePath);
  clearTimeout(debounceTimers.get(resolved));

  debounceTimers.set(
    resolved,
    setTimeout(() => {
      debounceTimers.delete(resolved);
      executeHMR(resolved, type);
    }, debounceMs)
  );
}

async function executeHMR(filePath, type) {
  const resolved = path.resolve(filePath);
  const rel = path.relative(PLUGIN_DIR, resolved);

  try {
    await getLock(resolved).runExclusive(async () => {
      if (type === 'unlink') {
        const count = unloadByFilePath(resolved);
        logger.info(`[HMR] Unloaded: ${rel} (${count})`);
      } else {
        // Load new plugins without registering
        const parent = getParentFolder(path.dirname(resolved));
        const loaded = await loadFile(resolved, parent, false);

        // Remove old plugins for this file
        unloadByFilePath(resolved);

        // Register newly loaded plugins
        for (const [id, plugin] of loaded) {
          setPlugin(id, plugin);
          registerToBuckets(id, plugin);
        }

        const action = type === 'add' ? 'Added' : 'Reloaded';
        logger.info(`[HMR] ${action}: ${rel} (${loaded.size})`);
      }

      syncCallback?.();
    });
  } catch (err) {
    handleError(`[HMR:${rel}] Failed:`, err);
  } finally {
    if (type === 'unlink') {
      deleteLockIfUnused(resolved);
    }
  }
}