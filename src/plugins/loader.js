import { Mutex } from 'async-mutex';
import { logger } from '#internals.js';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { PLUGIN_DIR, EVENTS, defaultEvent } from './config.js';
import { handleError } from './handle-error.js';
import { compile } from './matcher.js';
import { setPlugin, registerToBuckets } from './registry.js';

const fileLocks = new Map();

export function getLock(filePath) {
  let lock = fileLocks.get(filePath);
  if (!lock) {
    lock = new Mutex();
    fileLocks.set(filePath, lock);
  }
  return lock;
}

export function deleteLockIfUnused(filePath) {
  const lock = fileLocks.get(filePath);
  if (lock && !lock.isLocked()) {
    fileLocks.delete(filePath);
  }
}

export function clearLocks() {
  fileLocks.clear();
}

export function getParentFolder(dirPath) {
  return path.relative(PLUGIN_DIR, dirPath).split(path.sep)[0] || null;
}

function normalize(value) {
  if (typeof value === 'function') return value;

  if (typeof value?.default === 'function') {
    const { default: fn, ...rest } = value;
    return Object.assign(fn, rest);
  }

  return null;
}

export async function loadFile(filePath, parent, shouldRegister = true) {
  const execute = async () => {
    const { mtimeMs } = await fs.stat(filePath);
    const mod = await import(`${pathToFileURL(filePath)}?v=${Math.trunc(mtimeMs)}`);
    const loaded = new Map();

    for (const [name, value] of Object.entries(mod)) {
      const plugin = normalize(value);
      if (!plugin || plugin.enabled === false) continue;

      const id = path.relative(PLUGIN_DIR, filePath)
        .replace(/\.[jt]s$/, '')
        .replaceAll(path.sep, '/') + ':' + name;

      const events = (Array.isArray(plugin.events) ? plugin.events : [])
        .filter(e => EVENTS.has(e));

      plugin._meta = {
        parent,
        filePath,
        id,
        events: events.length ? events : [defaultEvent],
        matchers: compile(plugin.match, plugin.prefix),
      };

      if (shouldRegister) {
        setPlugin(id, plugin);
        registerToBuckets(id, plugin);
      }

      loaded.set(id, plugin);
    }

    return loaded;
  };

  return shouldRegister
    ? getLock(filePath).runExclusive(execute)
    : execute();
}

export async function loadAll() {
  await fs.mkdir(PLUGIN_DIR, { recursive: true }).catch(() => {});

  const entries = await fs.readdir(PLUGIN_DIR, {
    withFileTypes: true,
    recursive: true
  }).catch(() => []);

  const files = entries
    .filter(e =>
      e.isFile() &&
      /(?<!\.d)\.[jt]s$/.test(e.name) &&
      !e.name.startsWith('_')
    )
    .map(e => {
      const dirPath = e.parentPath ?? e.path;
      return {
        path: path.join(dirPath, e.name),
        parent: getParentFolder(dirPath)
      };
    });

  const results = await Promise.allSettled(
    files.map(({ path: p, parent }) => loadFile(p, parent))
  );

  let loaded = 0;
  let failed = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      loaded += result.value?.size ?? 0;
    } else {
      failed++;
      const rel = path.relative(PLUGIN_DIR, files[i].path);
      handleError(`[PluginManager:${rel}] Failed to load:`, result.reason);
    }
  }

  logger.info(
    `[PluginManager] Loaded ${loaded} plugins${failed ? ` (${failed} failed)` : ''}`
  );
}